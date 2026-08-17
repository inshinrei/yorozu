import { join } from "node:path"
import { LruMap } from "@yorozu/utils"
import { fileExists } from "../misc/fs"
import { normalizeFilePath } from "../misc/path"

let findPackageJsonCache = new LruMap<string, string | null>(32)

export async function findPackageJson(from: string | URL): Promise<string | null> {
    from = normalizeFilePath(from)

    if (findPackageJsonCache.has(from)) {
        return findPackageJsonCache.get(from) ?? null
    }

    let current = from
    while (true) {
        let file = join(current, "package.json")
        if (await fileExists(file)) {
            findPackageJsonCache.set(from, file)
            return file
        }

        let parent = join(current, "..")
        if (parent === current) {
            findPackageJsonCache.set(from, null)
            return null
        }

        current = parent
    }
}
