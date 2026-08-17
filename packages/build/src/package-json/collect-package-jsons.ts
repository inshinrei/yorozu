import { join } from "node:path"
import { glob } from "tinyglobby"
import { normalizeFilePath } from "../misc/path"
import type { PackageJson } from "./types"
import { parsePackageJsonFromDir, parseWorkspaceRootPackageJson } from "./parse"

let maxDepth = process.env.YOROZU_BUILD_MAX_DEPTH !== undefined ? Number(process.env.YOROZU_BUILD_MAX_DEPTH) : 5

export interface WorkspacePackage {
    path: string
    packageJsonPath: string
    root: boolean
    json: PackageJson
}

export async function collectPackageJsons(
    workspaceRoot: string | URL,
    includeRoot = false,
): Promise<Array<WorkspacePackage>> {
    workspaceRoot = normalizeFilePath(workspaceRoot)

    let packages: Array<WorkspacePackage> = []
    let { path: rootPackageJsonPath, json: rootPackageJson } = await parseWorkspaceRootPackageJson(workspaceRoot)

    if (!rootPackageJson.workspaces) {
        throw new Error("No workspaces found in package.json")
    }

    if (includeRoot) {
        packages.push({
            path: workspaceRoot,
            root: true,
            json: rootPackageJson,
            packageJsonPath: rootPackageJsonPath,
        })
    }

    for (let dir of await glob({
        patterns: rootPackageJson.workspaces,
        cwd: workspaceRoot,
        onlyDirectories: true,
        followSymbolicLinks: true,
        deep: maxDepth,
    })) {
        try {
            let { json, path: packageJsonPath } = await parsePackageJsonFromDir(join(workspaceRoot, dir))
            packages.push({
                path: join(workspaceRoot, dir),
                root: false,
                packageJsonPath,
                json,
            })
        } catch (err) {
            if (isPackageNotFound(err)) continue
            throw err
        }
    }

    return packages
}

export function filterPackageJsonsForPublish(
    packages: Array<WorkspacePackage>,
    registry: "jsr" | "npm",
): Array<WorkspacePackage> {
    let otherRegistry = registry === "npm" ? "jsr" : "npm"
    return packages.filter(pkg => {
        if (pkg.root) return false

        let config = pkg.json.yorozu
        if (!config) return true
        if (config.private) return false
        if (config[registry] === "skip") return false
        if (config[otherRegistry] === "only") return false

        return true
    })
}

function isPackageNotFound(err: unknown): boolean {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return true
    if (err instanceof Error && err.cause != null && typeof err.cause === "object" && "notFound" in err.cause) {
        return err.cause.notFound === true
    }
    return false
}
