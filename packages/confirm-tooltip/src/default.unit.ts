import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

let here = dirname(fileURLToPath(import.meta.url))
let pkgRoot = join(here, "..")

let tokenNames = [
    "--yorozu-confirm-min-width",
    "--yorozu-confirm-max-width",
    "--yorozu-confirm-padding",
    "--yorozu-confirm-radius",
    "--yorozu-confirm-z",
    "--yorozu-confirm-color",
    "--yorozu-confirm-font-family",
    "--yorozu-confirm-font-size",
    "--yorozu-confirm-bg",
    "--yorozu-confirm-blur",
    "--yorozu-confirm-saturate",
    "--yorozu-confirm-border",
    "--yorozu-confirm-shadow",
    "--yorozu-confirm-title-weight",
    "--yorozu-confirm-title-size",
    "--yorozu-confirm-title-line",
    "--yorozu-confirm-desc-color",
    "--yorozu-confirm-desc-size",
    "--yorozu-confirm-desc-line",
    "--yorozu-confirm-desc-margin",
    "--yorozu-confirm-actions-margin",
    "--yorozu-confirm-danger-bg",
    "--yorozu-confirm-danger-color",
    "--yorozu-confirm-danger-radius",
    "--yorozu-confirm-danger-padding",
    "--yorozu-confirm-danger-size",
    "--yorozu-confirm-danger-min-width",
    "--yorozu-confirm-disabled-opacity",
]

describe("default iOS liquid-glass confirm styles", () => {
    it("tokens.css defines each --yorozu-confirm-* variable and dark scheme", () => {
        let css = readFileSync(join(here, "tokens.css"), "utf8")
        for (let name of tokenNames) {
            expect(css).toContain(name)
        }
        expect(css).toContain("prefers-color-scheme: dark")
    })

    it("default.css imports tokens and applies glass without focus ring or host tokens", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        expect(css).toContain('@import "./tokens.css"')
        expect(css).toContain("backdrop-filter")
        expect(css).toContain("-webkit-backdrop-filter")
        expect(css).toContain("outline: none")
        expect(css).toContain("[data-yorozu-confirm]")
        expect(css).toContain("[data-yorozu-confirm-danger]")
        expect(css).not.toContain("outline: auto")
        expect(css).not.toContain("outline-offset")
        expect(css).not.toContain("--vkui")
        expect(css).not.toContain("vkui")
    })

    it("package.json exports tokens.css and default.css", () => {
        let pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
            exports: Record<string, string>
        }
        expect(pkg.exports["./tokens.css"]).toBe("./src/tokens.css")
        expect(pkg.exports["./default.css"]).toBe("./src/default.css")
    })
})
