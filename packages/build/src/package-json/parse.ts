import { readFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { load as loadYaml } from "js-yaml"
import json5 from "json5"
import { fileExists } from "../misc/fs"
import { normalizeFilePath } from "../misc/path"
import { type PackageJson, PackageJsonSchema } from "./types"

const PackageJsonExtensions = ["json", "json5", "jsonc", "yml", "yaml"] as const

export function parsePackageJson(packageJson: string, format: "json" | "yaml" = "json"): PackageJson {
    let obj: unknown
    if (format === "json") {
        obj = json5.parse(packageJson)
    } else {
        obj = loadYaml(packageJson)
    }

    return PackageJsonSchema.parse(obj)
}

export async function parsePackageJsonFile(packageJsonPath: string | URL): Promise<PackageJson> {
    let path = normalizeFilePath(packageJsonPath)
    let ext = extname(path).slice(1)

    let format: "json" | "yaml"
    if (ext === "json5" || ext === "jsonc" || ext === "json") format = "json"
    else if (ext === "yml" || ext === "yaml") format = "yaml"
    else throw new Error(`Unknown package.json extension: ${ext}`)

    try {
        return parsePackageJson(await readFile(path, "utf8"), format)
    } catch (err) {
        throw new Error(`Could not parse package.json at ${packageJsonPath}`, { cause: err })
    }
}

export async function parsePackageJsonFromDir(dir: string | URL): Promise<{ path: string; json: PackageJson }> {
    dir = normalizeFilePath(dir)

    let packageJsonPath: string | undefined
    for (let ext of PackageJsonExtensions) {
        let candidate = join(dir, `package.${ext}`)
        if (await fileExists(candidate)) {
            packageJsonPath = candidate
            break
        }
    }

    if (packageJsonPath == null) {
        throw new Error(`Could not find package.json at ${dir}`, { cause: { notFound: true } })
    }

    return {
        path: packageJsonPath,
        json: await parsePackageJsonFile(packageJsonPath),
    }
}

interface PnpmWorkspaceYaml {
    packages?: Array<string>
    catalog?: Record<string, string>
    catalogs?: Record<string, Record<string, string>>
}

export async function parseWorkspaceRootPackageJson(
    workspaceRoot: string | URL,
): Promise<{ path: string; json: PackageJson }> {
    workspaceRoot = normalizeFilePath(workspaceRoot)

    let { path: packageJsonPath, json } = await parsePackageJsonFromDir(workspaceRoot)

    if (json.workspaces) {
        return { path: packageJsonPath, json }
    }

    let pnpmWorkspacePath = join(workspaceRoot, "pnpm-workspace.yaml")
    let yaml: string
    try {
        yaml = await readFile(pnpmWorkspacePath, "utf8")
    } catch (err) {
        if (err instanceof Error && "code" in err && err.code === "ENOENT") {
            return { path: packageJsonPath, json }
        }
        throw err
    }

    let workspace = loadYaml(yaml) as PnpmWorkspaceYaml
    if (workspace?.packages == null) {
        throw new Error("No packages found in pnpm-workspace.yaml")
    }

    if (workspace.catalog || workspace.catalogs) {
        let catalogs: Record<string, Record<string, string>> = {}
        if (workspace.catalog) {
            catalogs[""] = workspace.catalog
        }
        if (workspace.catalogs) {
            for (let [name, catalog] of Object.entries(workspace.catalogs)) {
                catalogs[name] = catalog
            }
        }
        json.catalogs = catalogs
    }

    json.workspaces = workspace.packages
    return { path: packageJsonPath, json }
}
