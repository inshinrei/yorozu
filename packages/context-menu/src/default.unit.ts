import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

let here = dirname(fileURLToPath(import.meta.url))
let pkgRoot = join(here, "..")

let tokenNames = [
    "--yorozu-menu-min-width",
    "--yorozu-menu-radius",
    "--yorozu-menu-pad-block",
    "--yorozu-menu-z",
    "--yorozu-menu-bg",
    "--yorozu-menu-shadow",
    "--yorozu-menu-color",
    "--yorozu-menu-font-size",
    "--yorozu-menu-font-weight",
    "--yorozu-menu-font-family",
    "--yorozu-menu-blur",
    "--yorozu-menu-item-margin",
    "--yorozu-menu-item-padding",
    "--yorozu-menu-item-padding-inline-end",
    "--yorozu-menu-item-radius",
    "--yorozu-menu-item-gap",
    "--yorozu-menu-item-min-block",
    "--yorozu-menu-item-hover",
    "--yorozu-menu-item-active-scale",
    "--yorozu-menu-icon-size",
    "--yorozu-menu-icon-color",
    "--yorozu-menu-destructive",
    "--yorozu-menu-divider",
    "--yorozu-menu-disabled-opacity",
    "--yorozu-menu-divider-margin",
]

describe("default compact menu styles", () => {
    it("tokens.css defines each --yorozu-menu-* variable", () => {
        let css = readFileSync(join(here, "tokens.css"), "utf8")
        for (let name of tokenNames) {
            expect(css).toContain(name)
        }
    })

    it("default.css imports tokens and shares hover/focus wash without focus ring", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        expect(css).toContain('@import "./tokens.css"')
        expect(css).toContain("outline: none")
        expect(css).toMatch(
            /:hover[\s\S]*:focus[\s\S]*--yorozu-menu-item-hover|:focus[\s\S]*:hover[\s\S]*--yorozu-menu-item-hover/,
        )
        expect(css).not.toContain("outline: auto")
        expect(css).not.toContain("outline-offset")
    })

    it("package.json exports tokens.css and default.css", () => {
        let pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
            exports: Record<string, string>
        }
        expect(pkg.exports["./tokens.css"]).toBe("./src/tokens.css")
        expect(pkg.exports["./default.css"]).toBe("./src/default.css")
    })

    it("disabled items do not keep the focus wash", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        expect(css).toMatch(/\[aria-disabled="true"\]:focus/)
        expect(css).toMatch(/\.disabled:focus/)
        expect(css).toContain("--yorozu-menu-divider-margin")
        expect(css).toMatch(/:active:not\(\.disabled\):not\(\[aria-disabled="true"\]\)/)
    })
})
