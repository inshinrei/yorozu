import { LruMap } from "@yorozu/utils"
import { exec } from "./exec"

let tsconfigFilesCache = new LruMap<string, Array<string>>(32)

export async function getTsconfigFor(cwd: string): Promise<unknown> {
    let res = await exec(["npx", "tsc", "--showConfig"], {
        cwd,
        throwOnError: true,
    })

    return JSON.parse(res.stdout)
}

export async function getTsconfigFiles(cwd: string): Promise<Array<string>> {
    let cached = tsconfigFilesCache.get(cwd)
    if (cached) return cached

    let config = await getTsconfigFor(cwd)

    if (typeof config !== "object" || config === null) {
        throw new Error("tsconfig.json is not an object")
    }
    if (!("files" in config) || !Array.isArray(config.files)) {
        throw new Error("tsconfig.json > .files is not an array")
    }

    let files = (config.files as Array<string>).map(file => file.replace(/^\.\//, ""))
    tsconfigFilesCache.set(cwd, files)
    return files
}
