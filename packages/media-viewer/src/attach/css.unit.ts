// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { isZoomable, paddingPx, parseCssLengthPx, rootFontSizePx, tokenLengthPx, viewportFallback } from "./css"
import { img } from "./test-helpers"
import type { MediaViewerItem } from "../types"

describe("parseCssLengthPx", () => {
    it("parses px", () => {
        expect(parseCssLengthPx("10px", 16)).toBe(10)
        expect(parseCssLengthPx(" 2.5px ", 16)).toBe(2.5)
        expect(parseCssLengthPx("-4px", 16)).toBe(-4)
    })

    it("parses rem against root font size", () => {
        expect(parseCssLengthPx("2rem", 16)).toBe(32)
    })

    it("returns null for invalid lengths", () => {
        expect(parseCssLengthPx("10em", 16)).toBeNull()
        expect(parseCssLengthPx("px", 16)).toBeNull()
        expect(parseCssLengthPx("", 16)).toBeNull()
        expect(parseCssLengthPx("nope", 16)).toBeNull()
    })
})

describe("tokenLengthPx", () => {
    it("returns fallback when style is null", () => {
        expect(tokenLengthPx(null, "--x", 9, 16)).toBe(9)
    })

    it("returns fallback when the token is missing", () => {
        let style = { getPropertyValue: (): string => "" } as unknown as CSSStyleDeclaration
        expect(tokenLengthPx(style, "--x", 9, 16)).toBe(9)
    })

    it("parses a rem token", () => {
        let style = {
            getPropertyValue: (name: string): string => (name === "--x" ? "2rem" : ""),
        } as unknown as CSSStyleDeclaration
        expect(tokenLengthPx(style, "--x", 9, 16)).toBe(32)
    })
})

describe("paddingPx", () => {
    it("uses fallback for empty or invalid input", () => {
        expect(paddingPx(undefined, 12)).toBe(12)
        expect(paddingPx("", 12)).toBe(12)
        expect(paddingPx("nope", 12)).toBe(12)
    })

    it("parses a numeric string", () => {
        expect(paddingPx("8px", 12)).toBe(8)
    })
})

describe("isZoomable", () => {
    it("is true only for image items", () => {
        expect(isZoomable(img("a"))).toBe(true)
        let gif: MediaViewerItem = { id: "g", kind: "gif", src: "g.gif" }
        let video: MediaViewerItem = { id: "v", kind: "video", src: "v.mp4" }
        expect(isZoomable(gif)).toBe(false)
        expect(isZoomable(video)).toBe(false)
        expect(isZoomable(null)).toBe(false)
        expect(isZoomable(undefined)).toBe(false)
    })
})

describe("viewportFallback", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("uses innerWidth and innerHeight when they are positive", () => {
        vi.stubGlobal("innerWidth", 1024)
        vi.stubGlobal("innerHeight", 768)
        expect(viewportFallback()).toEqual({ width: 1024, height: 768 })
    })

    it("falls back to 800 when innerWidth is 0", () => {
        vi.stubGlobal("innerWidth", 0)
        vi.stubGlobal("innerHeight", 0)
        expect(viewportFallback()).toEqual({ width: 800, height: 800 })
    })
})

describe("rootFontSizePx", () => {
    it("returns 16 when computed font-size is missing", () => {
        expect(rootFontSizePx()).toBeGreaterThan(0)
    })
})
