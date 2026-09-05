import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

let here = dirname(fileURLToPath(import.meta.url))
let pkgRoot = join(here, "..")

let tokenNames = [
    "--yorozu-toast-z",
    "--yorozu-toast-inset",
    "--yorozu-toast-gap",
    "--yorozu-toast-max-inline",
    "--yorozu-toast-radius",
    "--yorozu-toast-padding",
    "--yorozu-toast-min-block",
    "--yorozu-toast-item-gap",
    "--yorozu-toast-color",
    "--yorozu-toast-font-family",
    "--yorozu-toast-font-size",
    "--yorozu-toast-line",
    "--yorozu-toast-bg",
    "--yorozu-toast-blur",
    "--yorozu-toast-saturate",
    "--yorozu-toast-border",
    "--yorozu-toast-shadow",
    "--yorozu-toast-close-color",
    "--yorozu-toast-close-hover",
    "--yorozu-toast-close-size",
    "--yorozu-toast-enter-ms",
    "--yorozu-toast-exit-ms",
]

describe("default iOS liquid-glass toast styles", () => {
    it("tokens.css defines each --yorozu-toast-* variable and dark scheme", () => {
        let css = readFileSync(join(here, "tokens.css"), "utf8")
        for (let name of tokenNames) {
            expect(css).toContain(name)
        }
        expect(css).toContain("--yorozu-toast-z: 1200")
        expect(css).toContain("--yorozu-toast-blur: 20px")
        expect(css).toContain("--yorozu-toast-saturate: 180%")
        expect(css).toContain("--yorozu-toast-bg: rgba(255, 255, 255, 0.72)")
        expect(css).toContain("prefers-color-scheme: dark")
    })

    it("default.css imports tokens and applies glass without focus ring or host tokens", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        expect(css).toContain('@import "./tokens.css"')
        expect(css).toContain("backdrop-filter")
        expect(css).toContain("-webkit-backdrop-filter")
        expect(css).toContain("outline: none")
        expect(css).toContain("[data-yorozu-toast-root]")
        expect(css).toContain("[data-yorozu-toast]")
        expect(css).toContain("[data-yorozu-toast].exiting")
        expect(css).toContain("[data-yorozu-toast-content]")
        expect(css).toContain("[data-yorozu-toast-close]")
        expect(css).toContain("[data-yorozu-toast][data-permanent] [data-yorozu-toast-close]")
        expect(css).toContain("@keyframes yorozu-toast-enter")
        expect(css).toContain("cubic-bezier(0.34, 1.56, 0.64, 1)")
        expect(css).not.toContain("outline: auto")
        expect(css).not.toContain(".toast-item .toast-exiting")
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
