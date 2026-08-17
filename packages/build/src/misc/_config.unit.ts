import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadBuildConfig } from "./_config"

describe("loadBuildConfig", () => {
    let dirs: Array<string> = []

    afterEach(async () => {
        await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })))
        dirs = []
    })

    async function tempDir(): Promise<string> {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-build-config-"))
        dirs.push(dir)
        return dir
    }

    it("returns undefined when build.config.js is missing", async () => {
        let dir = await tempDir()
        expect(await loadBuildConfig(dir)).toBeUndefined()
    })

    it("loads a present build.config.js", async () => {
        let dir = await tempDir()
        await writeFile(join(dir, "build.config.js"), "export default { viteConfig: 'vite.config.ts' }\n")
        expect(await loadBuildConfig(dir)).toEqual({ viteConfig: "vite.config.ts" })
    })

    it("throws when a present build.config.js fails to resolve an import", async () => {
        let dir = await tempDir()
        await writeFile(
            join(dir, "build.config.js"),
            "import 'yorozu-missing-build-config-dep'\nexport default { viteConfig: 'x.js' }\n",
        )

        await expect(loadBuildConfig(dir)).rejects.toThrow("Could not load build.config.js")
    })
})
