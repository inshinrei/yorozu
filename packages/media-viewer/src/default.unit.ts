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
    "--yorozu-media-filmstrip-ms",
    "--yorozu-media-filmstrip-thumb-h",
    "--yorozu-media-filmstrip-thumb-w",
    "--yorozu-media-filmstrip-current-w",
    "--yorozu-media-filmstrip-gap",
    "--yorozu-media-filmstrip-bg",
    "--yorozu-media-filmstrip-radius",
    "--yorozu-media-filmstrip-max-width",
    "--yorozu-media-filmstrip-stage-gap",
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
        expect(css).toContain("--yorozu-media-filmstrip-ms: 0.2s")
        expect(css).toContain("--yorozu-media-filmstrip-thumb-h: 4rem")
        expect(css).toContain("--yorozu-media-filmstrip-thumb-w: 2.75rem")
        expect(css).toContain("--yorozu-media-filmstrip-current-w: 3.75rem")
        expect(css).toContain("--yorozu-media-filmstrip-gap: 1px")
        expect(css).toContain("--yorozu-media-filmstrip-bg: rgba(0, 0, 0, 0.5)")
        expect(css).toContain("--yorozu-media-filmstrip-radius: 0.25rem")
        expect(css).toContain("--yorozu-media-filmstrip-max-width: 36%")
        expect(css).toContain("[data-yorozu-media-viewer]")
    })

    it("default.css imports tokens and paints overlay, stage, neighbors, and ghost hide", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        expect(css).toContain('@import "./tokens.css"')
        expect(css).toContain("[data-yorozu-media-viewer]")
        expect(css).toContain("[data-yorozu-media-viewport]")
        expect(css).toContain('[data-side="older"]')
        expect(css).not.toContain("[data-side=older]")
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
        expect(css).toContain("[data-yorozu-media-filmstrip]")
        expect(css).toContain("[data-yorozu-media-thumb]")
        expect(css).toContain("[data-current]")
        expect(css).toContain("opacity: 0.55")
        expect(css).toContain("--yorozu-media-filmstrip-ms")
        expect(css).toContain("touch-action: pan-x")
        expect(css).toContain("bottom: var(--yorozu-media-filmstrip-thumb-h)")
    })

    it("filmstrip overrides inherited touch-action none so overflow-x pan works", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        let filmstripBlock = css.match(/(?:^|\n)\[data-yorozu-media-filmstrip\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(filmstripBlock).toContain("touch-action: pan-x")
        expect(filmstripBlock).toContain("overscroll-behavior: none")
        expect(filmstripBlock).toContain("overflow-x: auto")
        expect(filmstripBlock).toContain("width: min(100%, var(--yorozu-media-filmstrip-max-width))")
        expect(filmstripBlock).toContain("margin-inline: auto")
        let overlayBlock = css.match(/(?:^|\n)\[data-yorozu-media-viewer\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(overlayBlock).toContain("touch-action: none")
    })

    it("filmstrip list is max-content with auto margin and no min-width center flex", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        let listBlock = css.match(/(?:^|\n)\[data-yorozu-media-filmstrip\]\s*\[role="list"\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(listBlock.length).toBeGreaterThan(0)
        expect(listBlock).toContain("width: max-content")
        expect(listBlock).toContain("margin-inline: auto")
        expect(listBlock).not.toContain("min-width: 100%")
        expect(listBlock).not.toContain("justify-content: center")
    })

    it("closing phase does not set pointer-events none so leftover gestures stay on the overlay", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        let closingBlock =
            css.match(/(?:^|\n)\[data-yorozu-media-viewer\]\[data-phase="closing"\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(closingBlock.length).toBeGreaterThan(0)
        expect(closingBlock).not.toContain("pointer-events: none")
        expect(closingBlock).not.toContain("pointer-events:none")
    })

    it("footer sits above the filmstrip when the strip is present and stays at bottom when not", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        let footerBlock = css.match(/(?:^|\n)\[data-yorozu-media-footer\]\s*\{[^}]*\}/)?.[0] ?? ""
        expect(footerBlock).toContain("bottom: 0")
        expect(css).toContain(
            "[data-yorozu-media-viewer]:has([data-yorozu-media-filmstrip]) [data-yorozu-media-footer]",
        )
        expect(css).toContain("bottom: var(--yorozu-media-filmstrip-thumb-h)")
    })

    it("tokens include filmstrip stage gap", () => {
        let css = readFileSync(join(here, "tokens.css"), "utf8")
        expect(css).toContain("--yorozu-media-filmstrip-stage-gap: 0.75rem")
    })

    it("filmstrip presence adds pane bottom padding above the strip", () => {
        let css = readFileSync(join(here, "default.css"), "utf8")
        expect(css).toContain("[data-yorozu-media-viewer]:has([data-yorozu-media-filmstrip]) [data-yorozu-media-pane]")
        expect(css).toContain(
            "padding-bottom: calc(var(--yorozu-media-filmstrip-thumb-h) + var(--yorozu-media-filmstrip-stage-gap))",
        )
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
