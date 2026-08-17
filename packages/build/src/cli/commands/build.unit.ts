import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { resolveViteConfig } from "./build"

describe("resolveViteConfig", () => {
    let dirs: Array<string> = []

    afterEach(async () => {
        await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })))
        dirs = []
    })

    async function tempDir(): Promise<string> {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-vite-config-"))
        dirs.push(dir)
        return dir
    }

    it("returns an explicit configured path without looking at the filesystem", async () => {
        let dir = await tempDir()
        expect(await resolveViteConfig(dir, "custom.config.ts")).toBe("custom.config.ts")
    })

    it("prefers vite.config.ts over vite.config.js", async () => {
        let dir = await tempDir()
        await writeFile(join(dir, "vite.config.ts"), "export default {}\n")
        await writeFile(join(dir, "vite.config.js"), "export default {}\n")
        expect(await resolveViteConfig(dir)).toBe("vite.config.ts")
    })

    it("falls back to vite.config.js when the ts file is missing", async () => {
        let dir = await tempDir()
        await writeFile(join(dir, "vite.config.js"), "export default {}\n")
        expect(await resolveViteConfig(dir)).toBe("vite.config.js")
    })

    it("defaults to vite.config.ts when neither file exists", async () => {
        let dir = await tempDir()
        expect(await resolveViteConfig(dir)).toBe("vite.config.ts")
    })
})
