import type { WorkspacePackage } from "../../package-json/collect-package-jsons"
import { join } from "node:path"
import { asNonNull } from "@yorozu/utils"
import { isRunningInGithubActions } from "../../ci/github-actions"
import { getLatestTag } from "../../git/utils"
import { exec } from "../../misc/exec"
import { collectPackageJsons, filterPackageJsonsForPublish } from "../../package-json/collect-package-jsons"
import { findProjectChangedPackages } from "../../versioning/collect-files"
import { info, warn } from "../log"
import { bc, loadConfig, resolveWorkspaceRoot } from "./_utils"
import { buildPackage } from "./build"

export async function runContinuousRelease(params: {
    workspaceRoot?: string
    workspace?: Array<WorkspacePackage>
    distDir?: string
    extraArgs?: Array<string>
    onlyChanged?: boolean
    onlyChangedSince?: string
}): Promise<void> {
    let {
        workspaceRoot = resolveWorkspaceRoot(),
        workspace = await collectPackageJsons(workspaceRoot, true),
        distDir = "dist",
        extraArgs = [],
        onlyChanged = false,
        onlyChangedSince,
    } = params

    let workspaceWithoutRoot = workspace.filter(pkg => !pkg.root)
    let packages = filterPackageJsonsForPublish(workspaceWithoutRoot, "npm")

    if (onlyChanged) {
        let config = await loadConfig({
            workspaceRoot,
            require: false,
        })
        let since = onlyChangedSince ?? (await getLatestTag(workspaceRoot))
        if (since == null) {
            throw new Error("no previous tag found, cannot determine changeset")
        }

        let changedPackages = await findProjectChangedPackages({
            params: config?.versioning,
            workspace: workspaceWithoutRoot,
            root: workspaceRoot,
            since,
        })

        if (!changedPackages.length) {
            info(`no packages changed since ${since}, nothing to do`)
            return
        }

        let changedPackagesNames = new Set<string>()
        for (let pkg of changedPackages) {
            changedPackagesNames.add(asNonNull(pkg.json.name))
        }

        let hadChanges = true
        while (hadChanges) {
            hadChanges = false

            for (let pkg of packages) {
                let pkgName = asNonNull(pkg.json.name)

                for (let field of ["dependencies", "peerDependencies"] as const) {
                    let deps = pkg.json[field]
                    if (deps == null) continue

                    for (let name of Object.keys(deps)) {
                        if (changedPackagesNames.has(name) && !changedPackagesNames.has(pkgName)) {
                            hadChanges = true
                            changedPackages.push(pkg)
                            changedPackagesNames.add(pkgName)
                            break
                        }
                    }
                }
            }
        }

        packages = changedPackages

        info(`only publishing changed packages since ${since}:`)
        for (let pkg of packages) {
            info(`  - ${pkg.json.name}`)
        }
    }

    if (!isRunningInGithubActions()) {
        throw new Error("cr command is only supported in github actions")
    }

    let distPaths: Array<string> = []

    for (let pkg of packages) {
        if (pkg.json.scripts?.build !== undefined) {
            await exec(["npm", "run", "build"], {
                cwd: join(pkg.path),
                stdio: "inherit",
                throwOnError: true,
            })
        } else {
            await buildPackage({
                workspaceRoot,
                workspace,
                packageName: asNonNull(pkg.json.name),
            })
        }

        distPaths.push(join(pkg.path, distDir))
    }

    if (extraArgs.some(item => item.startsWith("--pnpm"))) {
        warn("`--pnpm` flag is not supported and may cause issues, please avoid using it")
    }

    await exec(["npx", "pkg-pr-new", "publish", ...extraArgs, ...distPaths], {
        cwd: workspaceRoot,
        throwOnError: true,
        stdio: "inherit",
    })
}

export let runContinuousReleaseCli = bc.command({
    name: "cr",
    desc: "publish the workspace to pkg.pr.new",
    options: {
        root: bc.string().desc("path to the root of the workspace (default: cwd)"),
        distDir: bc.string("dist-dir").desc("directory to publish from, relative to package root (default: dist)"),
        extraArgs: bc.string("extra-args").desc("extra arguments to pass to pkg-pr-new"),
        onlyChanged: bc
            .boolean("only-changed")
            .desc("whether to only publish packages changed since the last release.")
            .default(false),
        onlyChangedSince: bc.string("only-changed-since").desc("starting point for the changelog (defaults to latest tag)"),
    },
    transform: args => {
        return {
            workspaceRoot: resolveWorkspaceRoot(args.root),
            distDir: args.distDir,
            extraArgs: args.extraArgs?.split(" "),
            onlyChanged: args.onlyChanged,
            onlyChangedSince: args.onlyChangedSince,
        }
    },
    handler: runContinuousRelease,
})
