import { join } from "node:path"
import process from "node:process"

let _cacheDir: string | undefined

export function getModuleCacheDirectory(): string {
    if (process.env.JSR_CACHE_DIR != null) return process.env.JSR_CACHE_DIR
    if (_cacheDir != null) return _cacheDir

    switch (process.platform) {
        case "win32": {
            return (_cacheDir = join(process.env.LOCALAPPDATA ?? process.env.APPDATA ?? "C:", "jsr-cache"))
        }
        case "darwin": {
            return (_cacheDir = join(process.env.HOME ?? "/tmp", "Library", "Caches", "jsr"))
        }
        default: {
            return (_cacheDir = join(process.env.XDG_CACHE_HOME ?? process.env.HOME ?? "/tmp", ".cache", "jsr"))
        }
    }
}

export interface ImportSpecifier {
    registry: "npm" | "jsr"
    packageName: string
    version: string
}

export function parseImportSpecifier(importSpecifier: string): ImportSpecifier {
    let [registry, specifier] = importSpecifier.split(":")
    if (registry !== "npm" && registry !== "jsr") {
        throw new Error(`Invalid import specifier: ${importSpecifier}`)
    }

    if (registry === "jsr" && specifier[0] === "/") {
        specifier = specifier.slice(1)
    }

    if (specifier.startsWith("@")) {
        let [pkg, version] = specifier.slice(1).split("@")
        return { registry, packageName: `@${pkg}`, version: version.split("/")[0] }
    }

    let [pkg, version] = specifier.split("@")
    return { registry, packageName: pkg, version: version.split("/")[0] }
}

export function splitImportRequest(request: string): [string, string] {
    if (request.startsWith("jsr:/")) request = `jsr:${request.slice(5)}`

    let parts = request.split("/")
    if (parts[0].match(/^(?:npm:|jsr:)?@/)) {
        return [parts.slice(0, 2).join("/"), parts.slice(2).join("/")]
    }

    return [parts[0], parts.slice(1).join("/")]
}
