import { readFile, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"
import process from "node:process"
import { asNonNull } from "@yorozu/utils"
import detectIndent from "detect-indent"
import { inc, parse, type ReleaseType } from "semver"
import type { CommitInfo, ConventionalCommit } from "../git/utils"
import { getCommitsBetween, getLatestTag, parseConventionalCommit } from "../git/utils"
import { normalizeFilePath } from "../misc/path"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { PackageJson } from "../package-json/types"
import { findRootPackage } from "../package-json/utils"
import type { VersioningOptions } from "./types"

export interface BumpVersionPackage {
    package: WorkspacePackage
    prevVersion: string
}

export interface BumpVersionResult {
    previousVersion: string
    nextVersion: string
    nextVersions: Record<string, string>
    changedPackages: Array<BumpVersionPackage>
    releaseType: ReleaseType
    hasBreakingChanges: boolean
    hasFeatures: boolean
}

function isOwnVersioning(pkg: WorkspacePackage): boolean {
    return Boolean(pkg.json.yorozu?.ownVersioning)
}

function isStandalone(pkg: WorkspacePackage): boolean {
    return Boolean(pkg.json.yorozu?.standalone)
}

function isManaged(pkg: WorkspacePackage): boolean {
    return !pkg.root && !isOwnVersioning(pkg) && !isStandalone(pkg)
}

function parseCommit(commit: CommitInfo): ConventionalCommit | null {
    return parseConventionalCommit(`${commit.message}\n${commit.description}`)
}

function summarizeCommits(commits: Array<CommitInfo>): { hasBreakingChanges: boolean; hasFeatures: boolean } {
    let hasBreakingChanges = false
    let hasFeatures = false
    for (let commit of commits) {
        let parsed = parseCommit(commit)
        if (!parsed) continue
        if (parsed.breaking) hasBreakingChanges = true
        if (parsed.type === "feat") hasFeatures = true
    }
    return { hasBreakingChanges, hasFeatures }
}

// 0.x is not a stable public API: breaking 0.0.x stays patch, breaking 0.x.y (x > 0) is minor, and feat on 0.x is patch.
function bumpFromFlags(
    oldVersion: string,
    flags: { hasBreakingChanges: boolean; hasFeatures: boolean },
): ReleaseType {
    let parsedVersion = parse(oldVersion)
    if (!parsedVersion) {
        throw new Error(`Invalid version: ${oldVersion}`)
    }

    if (flags.hasBreakingChanges) {
        if (parsedVersion.major === 0 && parsedVersion.minor === 0) return "patch"
        if (parsedVersion.major === 0) return "minor"
        return "major"
    }
    if (flags.hasFeatures) {
        return parsedVersion.major === 0 ? "patch" : "minor"
    }
    return "patch"
}

export function determineBumpType(params: { oldVersion: string; commits: Array<CommitInfo> }): ReleaseType {
    return bumpFromFlags(params.oldVersion, summarizeCommits(params.commits))
}

async function writePackageVersion(pkg: WorkspacePackage, version: string, dryRun: boolean): Promise<void> {
    if (!dryRun) {
        let pkgJsonPath = pkg.packageJsonPath
        let pkgJsonText = await readFile(pkgJsonPath, "utf8")
        let indent = detectIndent(pkgJsonText).indent || "    "
        let pkgJson = JSON.parse(pkgJsonText) as PackageJson
        pkgJson.version = version
        await writeFile(pkgJsonPath, `${JSON.stringify(pkgJson, null, indent)}\n`)
    }
    pkg.json.version = version
}

async function nextStandaloneVersion(pkg: WorkspacePackage, cwd: string | URL): Promise<string> {
    let current = asNonNull(pkg.json.version)
    let tag: string | null
    try {
        tag = await getLatestTag(pkg.path)
    } catch {
        tag = null
    }
    if (tag == null) return current

    let commits: Array<CommitInfo>
    try {
        let rel = relative(normalizeFilePath(cwd), pkg.path)
        commits = await getCommitsBetween({
            since: tag,
            cwd,
            files: [join(rel || ".", "**")],
        })
    } catch {
        return current
    }
    if (commits.length === 0) return current

    let bumpType = determineBumpType({ oldVersion: current, commits })
    let next = inc(current, bumpType)
    if (next == null) {
        throw new Error(`Invalid version increment: ${current} → ${bumpType}`)
    }
    return next
}

function recordVersion(
    nextVersions: Record<string, string>,
    changedPackages: Array<BumpVersionPackage>,
    pkg: WorkspacePackage,
    prevVersion: string,
    next: string,
): void {
    if (pkg.json.name != null) {
        nextVersions[pkg.json.name] = next
    }
    if (next !== prevVersion) {
        changedPackages.push({ package: pkg, prevVersion })
    }
}

export async function bumpVersion(params: {
    workspace: Array<WorkspacePackage>
    all?: boolean
    type?: ReleaseType
    cwd?: string | URL
    since: string
    params?: VersioningOptions
    dryRun?: boolean
    withRoot?: boolean
}): Promise<BumpVersionResult> {
    let { workspace, type: explicitType, cwd = process.cwd(), since, dryRun = false, withRoot = false } = params

    let rootPackage = findRootPackage(workspace)
    let previousVersion = rootPackage.json.version
    if (previousVersion == null) {
        throw new Error("Workspace root package.json is missing a version")
    }

    let type: ReleaseType
    let hasFeatures = false
    let hasBreakingChanges = false

    if (explicitType == null) {
        let commits = await getCommitsBetween({ since, cwd })
        ;({ hasFeatures, hasBreakingChanges } = summarizeCommits(commits))
        type = bumpFromFlags(previousVersion, { hasFeatures, hasBreakingChanges })
    } else {
        type = explicitType
    }

    let nextVersion = inc(previousVersion, type)
    if (nextVersion == null) {
        throw new Error(`Invalid version increment: ${previousVersion} → ${type}`)
    }

    let nextVersions: Record<string, string> = {}
    let changedPackages: Array<BumpVersionPackage> = []

    for (let pkg of workspace) {
        if (!isManaged(pkg)) continue
        let prevVersion = asNonNull(pkg.json.version)
        await writePackageVersion(pkg, nextVersion, dryRun)
        recordVersion(nextVersions, changedPackages, pkg, prevVersion, nextVersion)
    }

    if (withRoot) {
        await writePackageVersion(rootPackage, nextVersion, dryRun)
        recordVersion(nextVersions, changedPackages, rootPackage, previousVersion, nextVersion)
    }

    for (let pkg of workspace) {
        if (pkg.root || isOwnVersioning(pkg) || !isStandalone(pkg)) continue
        let prevVersion = asNonNull(pkg.json.version)
        let standaloneNext = await nextStandaloneVersion(pkg, cwd)
        if (standaloneNext === prevVersion) continue
        await writePackageVersion(pkg, standaloneNext, dryRun)
        recordVersion(nextVersions, changedPackages, pkg, prevVersion, standaloneNext)
    }

    return {
        previousVersion,
        nextVersion,
        nextVersions,
        changedPackages,
        releaseType: type,
        hasBreakingChanges,
        hasFeatures,
    }
}
