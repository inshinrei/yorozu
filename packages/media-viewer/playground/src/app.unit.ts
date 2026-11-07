import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

let css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "app.css"), "utf8")

describe("playground album host css", () => {
    it("keeps the grid full-bleed", () => {
        expect(css).toContain(".pg-grid {")
        expect(css).toContain("width: 100%")
        expect(css).toContain("max-width: none")
        expect(css).not.toContain("max-width: 34rem")
    })

    it("wraps albums instead of stretching them", () => {
        expect(css).toMatch(/\.pg-albums\s*\{[\s\S]*flex-wrap:\s*wrap/)
        expect(css).toMatch(/\.pg-albums\s*\{[\s\S]*width:\s*100%/)
        let albumBlock = css.match(/\.pg-album\s*\{[^}]+\}/)?.[0] ?? ""
        expect(albumBlock).toContain("max-width: 100%")
        expect(albumBlock).not.toContain("    width: 100%")
        expect(css).not.toContain('.pg-album[data-count="1"]')
    })
})
