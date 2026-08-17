import type { ReleaseType } from "semver"
import type { BumpVersionResult } from "../../versioning/bump-version"
import { isRunningInGithubActions, writeGithubActionsOutput } from "../../ci/github-actions"
import { getLatestTag } from "../../git/utils"
import { collectPackageJsons } from "../../package-json/collect-package-jsons"
import { bumpVersion } from "../../versioning/bump-version"
import { info } from "../log"
import { bc, loadConfig, resolveWorkspaceRoot } from "./_utils"

export type BumpVersionKind = "major" | "minor" | "patch" | "auto"

export function sharedWorkspaceBumpOptions(params: { type: BumpVersionKind; dryRun?: boolean }): {
    type: ReleaseType | undefined
    withRoot: true
    all: true
    dryRun?: boolean
} {
    return {
        type: params.type === "auto" ? undefined : params.type,
        withRoot: true,
        all: true,
        dryRun: params.dryRun,
    }
}

export function formatBumpVersionResult(result: BumpVersionResult, withReleaseType: boolean): string {
    let lines: Array<string> = []
    if (withReleaseType) {
        lines.push(`detected release type: ${result.releaseType}`)
        lines.push(`  has breaking changes: ${result.hasBreakingChanges}`)
        lines.push(`  has new features: ${result.hasFeatures}`)
        lines.push("")
    }

    lines.push("list of changed packages:")
    for (let { package: pkg, prevVersion } of result.changedPackages) {
        let versionStr = prevVersion
        if (!pkg.json.yorozu?.ownVersioning) {
            versionStr += ` → ${pkg.json.version}`
        }
        lines.push(`  ${pkg.json.name}: ${versionStr}`)
    }

    return lines.join("\n")
}

export let bumpVersionCli = bc.command({
    name: "bump-version",
    desc: "bump the shared workspace version",
    options: {
        root: bc.string().desc("path to the root of the workspace (default: process.cwd())"),
        type: bc
            .string()
            .desc("override type of release (major, minor, patch) (default: auto-detect)")
            .enum("major", "minor", "patch", "auto")
            .default("auto"),
        since: bc.string().desc("starting point for the changelog (default: latest tag)"),
        dryRun: bc.boolean("dry-run").desc("whether to only print the detected changes without actually modifying anything"),
        quiet: bc.boolean().desc("whether to only print the new version number").alias("q"),
    },
    handler: async args => {
        let root = resolveWorkspaceRoot(args.root)
        let releaseType = args.type === "auto" ? undefined : args.type

        let workspace = await collectPackageJsons(root, true)
        let config = await loadConfig({
            workspaceRoot: root,
            require: false,
        })

        let since = args.since ?? (await getLatestTag(root))
        if (since == null) {
            throw new Error("no previous tag found, cannot determine changeset")
        }

        let result = await bumpVersion({
            workspace,
            cwd: root,
            since,
            params: config?.versioning,
            ...sharedWorkspaceBumpOptions({ type: args.type, dryRun: args.dryRun }),
        })

        if (args.quiet) {
            info(JSON.stringify(result.nextVersions))
        } else {
            info(formatBumpVersionResult(result, releaseType == null))
        }

        if (isRunningInGithubActions()) {
            writeGithubActionsOutput("versions", JSON.stringify(result.nextVersions))
            writeGithubActionsOutput("hasBreakingChanges", String(result.hasBreakingChanges))
            writeGithubActionsOutput("hasFeatures", String(result.hasFeatures))
            writeGithubActionsOutput("changedPackages", result.changedPackages.map(item => item.package.json.name).join(","))
        }
    },
})
