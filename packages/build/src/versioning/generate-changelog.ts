import { join, relative } from "node:path"
import { asNonNull } from "@yorozu/utils"
import { warn } from "../cli/log"
import type { CommitInfo, ConventionalCommit } from "../git/utils"
import { findChangedFiles, getCommitsBetween, parseConventionalCommit } from "../git/utils"
import type { WorkspacePackage } from "../package-json/index"
import { findProjectChangedFiles } from "./collect-files"
import type { VersioningOptions } from "./types"

const SKIPPED_TYPES = new Set(["chore", "ci", "docs", "test"])

function defaultOnParseFailed(commit: CommitInfo): void {
    warn(`Failed to parse commit message: ${commit.message}`)
}

function defaultCommitFormatter(commit: CommitInfo, parsed: ConventionalCommit): string {
    let line = `- ${commit.hash}: ${parsed.breaking ? "**❗ BREAKING** " : ""}${commit.message}`

    if (parsed.breaking && commit.description) {
        line += `\n${commit.description
            .trim()
            .split("\n")
            .map(item => `  ${item}`)
            .join("\n")}`
    }

    return line
}

function defaultCommitFilter(_commit: CommitInfo, parsed: ConventionalCommit): boolean {
    if (parsed.breaking) return true
    if (!parsed.type || SKIPPED_TYPES.has(parsed.type)) return false
    return true
}

function defaultPackageCommitsFormatter(packageName: string, commits: Record<string, string>): string {
    return `### ${packageName}\n${Object.values(commits).join("\n")}`
}

export async function generateChangelog(params: {
    workspace: Array<WorkspacePackage>
    cwd?: string | URL
    since: string
    params?: VersioningOptions
}): Promise<string> {
    let {
        cwd,
        since,
        params: {
            changelog: {
                onCommitParseFailed = defaultOnParseFailed,
                onCommitsFetched,
                commitFilter = defaultCommitFilter,
                commitFilterWithFiles,
                commitFormatter = defaultCommitFormatter,
                packageCommitsFormatter = defaultPackageCommitsFormatter,
            } = {},
        } = {},
    } = params

    let commitsByPackage: Record<string, Record<string, string>> = {}

    let changedFiles = await findProjectChangedFiles({
        params: params.params ?? {},
        workspace: params.workspace,
        root: cwd,
        since,
    })

    let changedFilesByPackage = new Map<string, WorkspacePackage>()
    for (let file of changedFiles) {
        changedFilesByPackage.set(join(relative(file.root, file.package.path), file.file), file.package)
    }

    let commits = await getCommitsBetween({ since, cwd })
    await onCommitsFetched?.(commits)

    for (let commit of commits) {
        let parsed = parseConventionalCommit(`${commit.message}\n${commit.description}`)

        if (!parsed) {
            onCommitParseFailed(commit)
            continue
        }

        if (!commitFilter(commit, parsed)) continue

        let changed = await findChangedFiles({ since: `${commit.hash}~1`, until: commit.hash, cwd })

        if (commitFilterWithFiles && !commitFilterWithFiles(commit, parsed, changed)) continue

        for (let file of changed) {
            let pkg = changedFilesByPackage.get(file)
            if (!pkg) continue

            let packageName = asNonNull(pkg.json.name)
            if (commitsByPackage[packageName] == null) commitsByPackage[packageName] = {}
            commitsByPackage[packageName][commit.hash] = commitFormatter(commit, parsed, changed)
        }
    }

    let changelog = ""

    for (let [pkg, packageCommits] of Object.entries(commitsByPackage)) {
        changelog += packageCommitsFormatter(pkg, packageCommits)
        changelog += "\n\n"
    }

    return changelog
}
