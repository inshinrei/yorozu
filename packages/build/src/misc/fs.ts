import type { CopyOptions } from "node:fs"
import { cp, stat } from "node:fs/promises"

export async function fileExists(path: string): Promise<boolean> {
    try {
        let info = await stat(path)
        return info.isFile()
    } catch {
        return false
    }
}

export async function directoryExists(path: string): Promise<boolean> {
    try {
        let info = await stat(path)
        return info.isDirectory()
    } catch {
        return false
    }
}

export async function tryCopy(src: string, dest: string, options?: CopyOptions): Promise<void> {
    try {
        await cp(src, dest, options)
    } catch (err) {
        if (err instanceof Error && "code" in err && err.code === "ENOENT") return
        throw err
    }
}
