import type { BuildHookContext, RootConfigObject } from "../../config"
import type { WorkspacePackage } from "../../package-json/collect-package-jsons"
import type { CustomBuildConfigObject } from "../../vite/config"
import { asNonNull } from "@yorozu/utils"
import * as td from "typedoc"
import { loadBuildConfig } from "../../misc/_config"
import { collectPackageJsons } from "../../package-json/collect-package-jsons"
import { processPackageJson } from "../../package-json/process-package-json"
import { bc, resolveWorkspaceRoot } from "./_utils"

const CUSTOM_ROOT_FIELDS: Array<string> = ["includePackages", "excludePackages"] satisfies Array<
    keyof NonNullable<RootConfigObject["typedoc"]>
>

const DEFAULT_CONFIG: Partial<td.TypeDocOptions> = {
    includeVersion: true,
    validation: {
        notExported: true,
        invalidLink: true,
        notDocumented: false,
    },
    excludePrivate: true,
    excludeExternals: true,
    excludeInternal: true,
    exclude: ["**/*/node_modules", "**/*.unit.ts", "**/*.test.ts", "**/*.test-utils.ts"],
}

class YorozuTypedocReader implements td.OptionsReader {
    readonly name = "@yorozu/build"
    readonly order = 0
    readonly supportsPackages = true

    private _workspace?: Array<WorkspacePackage>
    private _rootConfig?: RootConfigObject

    constructor(readonly workspaceRoot: string) {}

    private _forwardOptions(options: td.Options, config: Partial<td.TypeDocOptions>, cwd: string): void {
        for (let [key, val] of Object.entries(config)) {
            if (CUSTOM_ROOT_FIELDS.includes(key)) continue
            options.setValue(key, val, cwd)
        }
    }

    async read(options: td.Options, _logger: td.Logger, cwd: string, _usedFile: (file: string) => void): Promise<void> {
        if (cwd === this.workspaceRoot) {
            let config = await loadBuildConfig<RootConfigObject>(cwd)
            this._rootConfig = config

            let data = config?.typedoc
            if (data != null) this._forwardOptions(options, data, cwd)

            options.setValue("entryPointStrategy", "packages")

            this._workspace = await collectPackageJsons(cwd)

            let entrypoints: Array<string> = []
            for (let pkg of this._workspace) {
                let pkgName = asNonNull(pkg.json.name)
                if (data?.includePackages && !data.includePackages.includes(pkgName)) continue
                if (data?.excludePackages?.includes(pkgName)) continue
                if (pkg.json.exports == null && !data?.includePackages?.includes(pkgName)) continue

                entrypoints.push(pkg.path)
            }

            options.setValue("entryPoints", entrypoints, cwd)
            return
        }

        let rootConfig = asNonNull(this._rootConfig)
        if (rootConfig.typedoc != null) this._forwardOptions(options, rootConfig.typedoc, cwd)

        let pkg = asNonNull(this._workspace?.find(item => item.path.replace(/\/$/, "") === cwd.replace(/\/$/, "")))
        let pkgConfig = await loadBuildConfig<CustomBuildConfigObject>(cwd)

        let hookContext: BuildHookContext = {
            outDir: "",
            packageDir: pkg.path,
            packageName: asNonNull(pkg.json.name),
            packageJson: pkg.json,
            jsr: false,
            typedoc: true,
        }

        pkgConfig?.preparePackageJson?.(hookContext)
        let { entrypoints } = processPackageJson({ packageJson: pkg.json, onlyEntrypoints: true })
        options.setValue("entryPoints", Object.values(Object.fromEntries(entrypoints)), cwd)

        if (!pkgConfig?.typedoc) return

        let data = pkgConfig.typedoc
        if (typeof data === "function") {
            data = data(options.getRawValues() as Partial<td.TypeDocOptions>)
        }

        this._forwardOptions(options, data, cwd)
    }
}

export async function generateDocs(params: { workspaceRoot: string }): Promise<void> {
    let app = await td.Application.bootstrapWithPlugins(DEFAULT_CONFIG, [
        new YorozuTypedocReader(params.workspaceRoot),
        new td.TSConfigReader(),
        new td.TypeDocReader(),
    ])

    let project = await app.convert()
    if (!project) {
        throw new Error("Could not convert to typedoc project")
    }

    if (app.options.getValue("treatWarningsAsErrors") && app.logger.hasWarnings()) {
        throw new Error("There were warnings while converting the project")
    }

    let preValidationWarnCount = app.logger.warningCount
    app.validate(project)
    let hadValidationWarnings = app.logger.warningCount !== preValidationWarnCount

    if (app.logger.hasErrors()) {
        throw new Error("There were errors while validating the project")
    }

    if (
        hadValidationWarnings &&
        (app.options.getValue("treatWarningsAsErrors") || app.options.getValue("treatValidationWarningsAsErrors"))
    ) {
        throw new Error("There were warnings while validating the project")
    }

    if (app.options.getValue("emit") === "none") return

    await app.generateOutputs(project)

    if (app.logger.hasErrors()) {
        throw new Error("There were errors while generating the outputs")
    }
    if (app.options.getValue("treatWarningsAsErrors") && app.logger.hasWarnings()) {
        throw new Error("There were warnings while generating the outputs")
    }
}

export let generateDocsCli = bc.command({
    name: "docs",
    desc: "generate docs using typedoc",
    options: {
        root: bc.string().desc("path to the root of the workspace (default: cwd)"),
    },
    handler: async args => {
        await generateDocs({
            workspaceRoot: resolveWorkspaceRoot(args.root),
        })
    },
})
