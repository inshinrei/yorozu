import type { WorkspacePackage } from "../../package-json/collect-package-jsons"
import { join, resolve } from "node:path"
import process from "node:process"
import { asNonNull } from "@yorozu/utils"
import { getWorkspaceRoot } from "../../misc/_config"
import { exec } from "../../misc/exec"
import { fileExists } from "../../misc/fs"
import { sortWorkspaceByPublishOrder } from "../../misc/publish-order"
import { collectPackageJsons, filterPackageJsonsForPublish } from "../../package-json/collect-package-jsons"
import { findPackageByName } from "../../package-json/utils"
import { info } from "../log"
import { bc, loadConfig } from "./_utils"

export async function resolveViteConfig(workspaceRoot: string, configured?: string): Promise<string> {
    if (configured != null) return configured
    if (await fileExists(join(workspaceRoot, "vite.config.ts"))) return "vite.config.ts"
    if (await fileExists(join(workspaceRoot, "vite.config.js"))) return "vite.config.js"
    return "vite.config.ts"
}

/**
 * build a single package using vite
 *
 * tiny wrapper on top of `vite build`
 */
export async function buildPackage(params: {
    /** path to the workspace root */
    workspaceRoot: string
    /**
     * list of workspace packages **including root**
     */
    workspace?: Array<WorkspacePackage>
    /** name of the package to build */
    packageName: string
    /** path to the `build.config.js` file */
    configPath?: string
    /** "fixed" version to use when building the package */
    fixedVersion?: string
}): Promise<void> {
    let config = await loadConfig({ workspaceRoot: params.workspaceRoot })
    let workspacePackages = params.workspace ?? (await collectPackageJsons(params.workspaceRoot, true))

    let viteConfig = await resolveViteConfig(params.workspaceRoot, config?.viteConfig)
    let packageRoot = findPackageByName(workspacePackages, params.packageName).path

    let env: NodeJS.ProcessEnv = {
        ...process.env,
        __YOROZU_INTERNAL_PACKAGES_LIST: JSON.stringify(workspacePackages),
    }
    if (params.fixedVersion != null) {
        env.__YOROZU_INTERNAL_FIXED_VERSION = params.fixedVersion
    }

    await exec(["npx", "vite", "build", "--config", join(params.workspaceRoot, viteConfig)], {
        env,
        cwd: packageRoot,
        stdio: "inherit",
        throwOnError: true,
    })
}

/**
 * build every npm-publishable workspace package in publish order
 */
export async function buildWorkspace(params: {
    workspaceRoot: string
    fixedVersion?: string
}): Promise<void> {
    let workspace = await collectPackageJsons(params.workspaceRoot, true)
    let workspaceWithoutRoot = workspace.filter(pkg => !pkg.root)
    let ordered = filterPackageJsonsForPublish(sortWorkspaceByPublishOrder(workspaceWithoutRoot), "npm")

    for (let pkg of ordered) {
        let packageName = asNonNull(pkg.json.name)
        info(`building ${packageName}`)
        await buildPackage({
            workspaceRoot: params.workspaceRoot,
            workspace,
            packageName,
            fixedVersion: params.fixedVersion,
        })
    }
}

export let buildPackageCli = bc.command({
    name: "build",
    desc: "build a package",
    options: {
        config: bc.string("config").desc("path to the build.config.js file"),
        root: bc.string().desc("path to the root of the workspace (default: cwd)"),
        packageName: bc
            .positional("package-name")
            .desc("name of the package to build (or :all to build the entire workspace)")
            .default(":all"),
        fixedVersion: bc
            .string("fixed-version")
            .desc("fixed version for every managed package (useful for pre-releases)"),
    },
    handler: async args => {
        let workspaceRoot = args.root != null ? resolve(process.cwd(), args.root) : getWorkspaceRoot()
        if (args.packageName === ":all") {
            await buildWorkspace({
                workspaceRoot,
                fixedVersion: args.fixedVersion,
            })
            return
        }

        await buildPackage({
            workspaceRoot,
            packageName: args.packageName,
            configPath: args.config,
            fixedVersion: args.fixedVersion,
        })
    },
})
