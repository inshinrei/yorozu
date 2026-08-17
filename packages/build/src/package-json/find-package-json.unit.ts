import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { findPackageJson } from "./find-package-json"

describe("findPackageJson", () => {
    it("walks parents until it finds a package.json", async () => {
        let from = new URL("../__fixtures__/pnpm-workspace/packages/package-a/src/index.ts", import.meta.url)
        let file = await findPackageJson(from)

        expect(file).toBe(
            fileURLToPath(new URL("../__fixtures__/pnpm-workspace/packages/package-a/package.json", import.meta.url)),
        )
    })

    it("returns null if no package.json is found", async () => {
        let file = await findPackageJson("/")
        expect(file).toBeNull()
    })
})
