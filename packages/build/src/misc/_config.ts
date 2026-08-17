import { join } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

const CONFIG_NAME = "build.config.js"

export function getWorkspaceRoot(cwd = process.cwd()): string {
    return process.env.YOROZU_ROOT || cwd
}

function isMissingConfigFile(err: unknown, configHref: string, configPath: string): boolean {
    if (!(err instanceof Error) || !("code" in err) || err.code !== "ERR_MODULE_NOT_FOUND") {
        return false
    }
    if ("url" in err && err.url === configHref) return true
    let match = err.message.match(/^Cannot find (?:module|package) '([^']+)' imported from /)
    if (!match) return false
    let specifier = match[1]
    return specifier === configHref || specifier === configPath
}

export async function loadBuildConfig<T>(packageRoot: string): Promise<T | undefined> {
    let configPath = join(packageRoot, CONFIG_NAME)
    let configHref = pathToFileURL(configPath).href
    try {
        let mod = (await import(configHref)).default
        if (typeof mod === "function") {
            return (await mod()) as T
        }
        return mod as T
    } catch (err: unknown) {
        if (isMissingConfigFile(err, configHref, configPath)) {
            return undefined
        }
        throw new Error(`Could not load ${CONFIG_NAME}`, { cause: err })
    }
}
