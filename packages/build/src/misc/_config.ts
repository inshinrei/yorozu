import { join } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

const CONFIG_NAME = "build.config.js"

export function getWorkspaceRoot(cwd = process.cwd()): string {
    return process.env.YOROZU_ROOT || cwd
}

export async function loadBuildConfig<T>(packageRoot: string): Promise<T | undefined> {
    try {
        let filePath = pathToFileURL(join(packageRoot, CONFIG_NAME)).href
        let mod = (await import(filePath)).default
        if (typeof mod === "function") {
            return (await mod()) as T
        }
        return mod as T
    } catch (err: unknown) {
        if (err instanceof Error && "code" in err && err.code === "ERR_MODULE_NOT_FOUND") {
            return undefined
        }
        throw new Error(`Could not load ${CONFIG_NAME}`, { cause: err })
    }
}
