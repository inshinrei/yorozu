import type { UnsafeMutate } from "@yorozu/utils"
import type { BuildHookContext } from "../config"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { CustomBuildConfigObject } from "../vite/config"
import type { JsrConfig } from "./config"
import * as fsp from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import process from "node:process"
import { asyncPool } from "@yorozu/utils"
import picomatch from "picomatch"
import { glob } from "tinyglobby"
import ts from "typescript"
import { loadBuildConfig } from "../misc/_config"
import { exec } from "../misc/exec"
import { fileExists, tryCopy } from "../misc/fs"
import { normalizeFilePath } from "../misc/path"
import { collectPackageJsons, filterPackageJsonsForPublish } from "../package-json/collect-package-jsons"
import { processPackageJson } from "../package-json/process-package-json"
import { collectVersions, findRootPackage } from "../package-json/utils"
import { applyDenoDirectives } from "./_deno-directives"
import { packageJsonToDeno } from "./deno-json"

function mergeArrays<T>(a: Array<T> | undefined, b: Array<T> | undefined, defaultValue: Array<T> = []): Array<T> {
    if (!a) return b ?? defaultValue
    if (!b) return a
    return [...a, ...b]
}

function shouldCopySource(source: string, srcDir: string, excludeFilesPico: (file: string) => boolean): boolean {
    let rel = relative(srcDir, source)
    if (rel === "") return true
    let parts = rel.split(/[\\/]/)
    if (parts.some(part => part === "node_modules" || part === ".git" || part === "dist")) return false
    if (excludeFilesPico(rel)) return false
    return true
}

export async function generateDenoWorkspace(params: {
    workspaceRoot: string | URL
    workspacePackages?: Array<WorkspacePackage>
    rootConfig?: JsrConfig
    withDryRun?: boolean
    fixedVersion?: string
}): Promise<string> {
    let {
        workspaceRoot: workspaceRoot_,
        workspacePackages = await collectPackageJsons(workspaceRoot_, true),
        rootConfig,
        withDryRun = false,
        fixedVersion,
    } = params

    let workspaceRoot = normalizeFilePath(workspaceRoot_)
    let rootPackage = findRootPackage(workspacePackages)

    let outDir = join(workspaceRoot, rootConfig?.outputDir ?? "dist/jsr")
    await fsp.rm(outDir, { recursive: true, force: true })
    await fsp.mkdir(outDir, { recursive: true })

    let rootDenoJson = {
        workspace: [] as Array<string>,
    }

    for (let pkg of filterPackageJsonsForPublish(workspacePackages, "jsr")) {
        if (pkg.json.name == null) continue
        if (rootConfig?.includePackage != null && !rootConfig.includePackage(pkg)) continue

        let packageRoot = pkg.path
        let packageDirName = pkg.json.name.replace(/\//g, "__")
        let packageOutRoot = join(outDir, packageDirName)

        rootDenoJson.workspace.push(`./${packageDirName}`)
        await fsp.mkdir(packageOutRoot, { recursive: true })

        if (pkg.json.scripts?.["build:jsr"] != null) {
            await exec(["npm", "run", "build:jsr"], {
                env: {
                    ...process.env,
                    YOROZU_BUILD_SRC: packageRoot,
                    YOROZU_BUILD_OUT: packageOutRoot,
                },
                cwd: packageRoot,
                stdio: "inherit",
                throwOnError: true,
            })
            continue
        }

        let packageConfig = await loadBuildConfig<CustomBuildConfigObject>(pkg.path)
        let packageConfigJsr = packageConfig?.jsr

        let srcDir = join(packageRoot, normalizeFilePath(packageConfigJsr?.sourceDir ?? rootConfig?.sourceDir ?? ""))
        let excludeFiles = mergeArrays(rootConfig?.exclude, packageConfigJsr?.exclude)
        let excludeFilesPico = picomatch(excludeFiles)

        await fsp.cp(srcDir, packageOutRoot, {
            recursive: true,
            filter(source) {
                return shouldCopySource(source, srcDir, excludeFilesPico)
            },
        })

        let printer = ts.createPrinter()
        let tsFiles = await glob("**/*.ts", { cwd: packageOutRoot })

        await asyncPool(tsFiles, async filename => {
            let fullFilePath = join(packageOutRoot, filename)

            let fileContent = await fsp.readFile(fullFilePath, "utf8")
            let changed = false

            let file = ts.createSourceFile(filename, fileContent, ts.ScriptTarget.ESNext, true)
            let changedTs = false

            for (let imp of file.statements) {
                if (!ts.isImportDeclaration(imp) && !ts.isExportDeclaration(imp)) {
                    continue
                }

                if (!imp.moduleSpecifier || !ts.isStringLiteral(imp.moduleSpecifier)) {
                    continue
                }

                let mod = imp.moduleSpecifier.text

                if (mod[0] !== ".") {
                    continue
                }

                if (mod.endsWith(".js") || mod.endsWith(".jsx")) {
                    let newMod = mod.replace(/\.js(x?)$/, ".ts$1")

                    let fullPathOld = join(dirname(fullFilePath), mod)
                    let fullPathNew = join(dirname(fullFilePath), newMod)

                    if (!(await fileExists(fullPathOld)) && (await fileExists(fullPathNew))) {
                        changedTs = true
                        ;(imp as UnsafeMutate<ts.ImportDeclaration>).moduleSpecifier = ts.factory.createStringLiteral(newMod)
                    }
                } else {
                    throw new Error(`Invalid import specifier: ${mod} at ${join(srcDir, filename)}`)
                }
            }

            if (rootConfig?.transformAst?.(file)) {
                changedTs = true
            }
            if (packageConfigJsr?.transformAst?.(file)) {
                changedTs = true
            }

            if (changedTs) {
                fileContent = printer.printFile(file)
                changed = true
            }

            if (rootConfig?.enableDenoDirectives) {
                fileContent = applyDenoDirectives(fileContent)
            }

            if (rootConfig?.transformCode || packageConfigJsr?.transformCode) {
                let origFileContent = fileContent

                if (rootConfig?.transformCode) {
                    fileContent = rootConfig.transformCode(filename, fileContent)
                }
                if (packageConfigJsr?.transformCode) {
                    fileContent = packageConfigJsr.transformCode(filename, fileContent)
                }

                if (fileContent !== origFileContent) {
                    changed = true
                }
            }

            if (changed) {
                await fsp.writeFile(fullFilePath, fileContent)
            }
        })

        let hookContext: BuildHookContext = {
            outDir: packageOutRoot,
            packageDir: packageOutRoot,
            packageName: pkg.json.name,
            packageJson: pkg.json,
            jsr: true,
            typedoc: false,
        }

        packageConfig?.preparePackageJson?.(hookContext)

        let workspaceVersions = collectVersions(workspacePackages)

        let { packageJson, packageJsonOriginal } = processPackageJson({
            packageJson: pkg.json,
            rootPackageJson: rootPackage.json,
            workspaceVersions,
            bundledWorkspaceDeps: [],
            rootFieldsToCopy: new Set(["license"]),
        })

        if (fixedVersion != null) {
            packageJson.version = fixedVersion
            packageJsonOriginal.version = fixedVersion
        }

        hookContext.packageJson = packageJson
        await packageConfig?.finalizePackageJson?.(hookContext)

        let denoJson = packageJsonToDeno({
            packageJson,
            packageJsonOrig: packageJsonOriginal,
            workspaceVersions,
            buildDirName: relative(packageOutRoot, outDir),
            baseDir: relative(packageRoot, srcDir),
            exclude: excludeFiles,
        })

        packageConfig?.jsr?.finalizeDenoJson?.(hookContext, denoJson as unknown as Record<string, unknown>)
        rootConfig?.finalizeDenoJson?.(hookContext, denoJson as unknown as Record<string, unknown>)

        await fsp.writeFile(join(packageOutRoot, "deno.json"), JSON.stringify(denoJson, null, 4))

        for (let file of mergeArrays(rootConfig?.copyRootFiles, packageConfig?.jsr?.copyRootFiles, ["LICENSE"])) {
            await tryCopy(join(workspaceRoot, file), join(packageOutRoot, file), { recursive: true })
        }
        for (let file of mergeArrays(rootConfig?.copyPackageFiles, packageConfig?.jsr?.copyPackageFiles, ["README.md"])) {
            await tryCopy(join(packageRoot, file), join(packageOutRoot, file), { recursive: true })
        }

        await packageConfig?.jsr?.finalize?.(hookContext)
    }

    await fsp.writeFile(join(outDir, "deno.json"), JSON.stringify(rootDenoJson, null, 4))

    await rootConfig?.finalize?.({
        outDir,
        packageDir: outDir,
        packageName: "<jsr-root>",
        packageJson: {},
        jsr: true,
        typedoc: false,
    })

    if (rootConfig?.dryRun === true || withDryRun) {
        await exec(["deno", "publish", "--dry-run", "-q", "--allow-dirty"], {
            cwd: outDir,
            stdio: "inherit",
            throwOnError: true,
        })
    }

    return outDir
}
