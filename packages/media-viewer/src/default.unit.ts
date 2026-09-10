import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

let here = dirname(fileURLToPath(import.meta.url))
let pkgRoot = join(here, "..")

let tokenNames = [
    "--yorozu-media-z",
    "--yorozu-media-scrim",
    "--yorozu-media-pad-top",
    "--yorozu-media-pad-bottom",
    "--yorozu-media-pad-x",
    "--yorozu-media-slide-gap",
    "--yorozu-media-open-ms",
    "--yorozu-media-close-ms",
    "--yorozu-media-chrome-ms",
    "--yorozu-media-switch-ms",
    "--yorozu-media-ghost-ms",
    "--yorozu-media-radius",
]

describe("default media viewer styles", () => {
    it("tokens.css defines each --yorozu-media-* variable", () => {
        let css = readFileSync(join(here, "tokens.css"), "utf8")
        for (let name of tokenNames) {
            expect(css).toContain(name)
        }
        expect(css).toContain("--yorozu-media-z: 1400")
        expect(css).toContain("--yorozu-media-scrim: #19191a")
        expect(css).toContain("--yorozu-media-pad-top: 3.25rem")
        expect(css).toContain("--yorozu-media-pad-bottom: 3.25rem")
        expect(css).toContain("--yorozu-media-pad-x: 0.75rem")
        expect(css).toContain("--yorozu-media-slide-gap: 40px")
        expect(css).toContain("--yorozu-media-open-ms: 220ms")
        expect(css).toContain("--yorozu-media-close-ms: 200ms")
        expect(css).toContain("--yorozu-media-chrome-ms: 150ms")
        expect(css).toContain("--yorozu-media-switch-ms: 320ms")
        expect(css).toContain("--yorozu-media-ghost-ms: 200ms")
        expect(css).toContain("--yorozu-media-radius: 0.75rem")
        expect(css).toContain("[data-yorozu-media-viewer]")
    })

    it("default.css imports tokens and paints overlay, stage, neighbors, and ghost hide", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        expect(css).toContain('@import "./tokens.css"')
        expect(css).toContain("[data-yorozu-media-viewer]")
        expect(css).toContain("[data-yorozu-media-viewport]")
        expect(css).toContain("[data-side=older]")
        expect(css).toContain("yorozu-media-ghost-animating")
        expect(css).toContain("visibility: hidden")
        expect(css).toContain("overscroll-behavior: none")
        expect(css).toContain("touch-action: none")
        expect(css).toContain("[data-yorozu-media-header]")
        expect(css).toContain("[data-yorozu-media-footer]")
        expect(css).toContain("[data-yorozu-media-chrome]")
        expect(css).toContain("[data-swipe-dismiss]")
        expect(css).toContain("--yorozu-media-dismiss-alpha")
        expect(css).not.toContain("data-gallery-stage-media")
        expect(css).toContain('[data-switch="newer"]')
        expect(css).toContain('[data-switch="older"]')
        expect(css).toContain('[data-switch="jump"]')
        expect(css).toContain("@keyframes yorozu-media-switch-newer")
        expect(css).toContain("@keyframes yorozu-media-switch-older")
        expect(css).toContain("@keyframes yorozu-media-switch-jump")
        expect(css).toContain("--yorozu-media-switch-ms")
    })

    it("does not pad the viewport the absolute strip overlays; pads a descendant the strip lays out", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        let viewportBlock = css.match(/(?:^|\n)\[data-yorozu-media-viewport\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(viewportBlock).toContain("overflow: hidden")
        expect(viewportBlock).not.toContain("padding")
        let stripBlock = css.match(/(?:^|\n)\[data-yorozu-media-strip\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(stripBlock).toContain("inset: 0")
        let paneBlock = css.match(/(?:^|\n)\[data-yorozu-media-pane\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(paneBlock).toContain("--yorozu-media-pad-top")
        expect(paneBlock).toContain("--yorozu-media-pad-x")
        expect(paneBlock).toContain("--yorozu-media-pad-bottom")
    })

    it("package.json exports tokens.css and default.css", () => {
        let pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
            exports: Record<string, string>
        }
        expect(pkg.exports["./tokens.css"]).toBe("./src/tokens.css")
        expect(pkg.exports["./default.css"]).toBe("./src/default.css")
    })
})
