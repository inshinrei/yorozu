import { join, relative } from "node:path"
import process from "node:process"
import picomatch from "picomatch"
import { findChangedFiles } from "../git/utils"
import { normalizeFilePath } from "../misc/path"
import { getTsconfigFiles } from "../misc/tsconfig"
import { collectPackageJsons, type WorkspacePackage } from "../package-json/index"
import type { VersioningOptions } from "./types"

export interface ProjectChangedFile {
    package: WorkspacePackage
    file: string
    root: string
}

const DEFAULT_EXCLUDE = ["**/*.unit.ts", "**/*.md"]

async function defaultShouldInclude(file: ProjectChangedFile): Promise<boolean> {
    if (!file.file.endsWith(".ts")) return true
    let tsconfigFiles = await getTsconfigFiles(join(file.root, file.package.path))
    return tsconfigFiles.includes(file.file)
}

function fileBelongsToPackage(file: string, pkgPath: string): boolean {
    if (pkgPath === "" || pkgPath === ".") return true
    return file === pkgPath || file.startsWith(`${pkgPath}/`)
}

export async function findProjectChangedFiles(params: {
    params?: VersioningOptions
    workspace?: Array<WorkspacePackage>
    root?: string | URL
    since: string
    until?: string
}): Promise<Array<ProjectChangedFile>> {
    let {
        params: { include, exclude = DEFAULT_EXCLUDE, shouldInclude = defaultShouldInclude } = {},
        root: rootInput = process.cwd(),
        since,
        until,
    } = params

    let root = normalizeFilePath(rootInput)

    let changed = await findChangedFiles({
        since,
        until,
        cwd: root,
    })

    if (!changed.length) return []

    let packages = (params.workspace ?? (await collectPackageJsons(root)))
        .filter(pkg => !pkg.root)
        .map(pkg => ({ pkg, relPath: relative(root, pkg.path) }))
        .sort((a, b) => b.relPath.length - a.relPath.length)

    let files: Array<ProjectChangedFile> = []

    let includeGlobs = include == null ? null : picomatch(include)
    let excludeGlobs = exclude == null ? null : picomatch(exclude)

    for (let file of changed) {
        let match = packages.find(item => fileBelongsToPackage(file, item.relPath))
        if (!match) continue

        let relPath = relative(match.relPath, file)

        if (includeGlobs != null && !includeGlobs(relPath)) continue
        if (excludeGlobs != null && excludeGlobs(relPath)) continue

        let info: ProjectChangedFile = {
            file: relPath,
            package: match.pkg,
            root,
        }

        if (!(await shouldInclude(info))) continue

        files.push(info)
    }

    return files
}

export async function findProjectChangedPackages(params: {
    params?: VersioningOptions
    workspace?: Array<WorkspacePackage>
    root?: string | URL
    since: string
    until?: string
}): Promise<Array<WorkspacePackage>> {
    let files = await findProjectChangedFiles(params)

    let set = new Set<WorkspacePackage>()
    for (let file of files) {
        set.add(file.package)
    }

    return Array.from(set)
}
