import { afterEach, describe, expect, it, vi } from "vitest"
import { prefersReducedMotion } from "./reduced-motion"

describe("prefersReducedMotion", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("returns false when matchMedia is missing", () => {
        vi.stubGlobal("window", {})
        expect(prefersReducedMotion()).toBe(false)
    })

    it("returns the media-query match", () => {
        vi.stubGlobal("window", {
            matchMedia: (q: string) => ({ matches: q.includes("reduce") }),
        })
        expect(prefersReducedMotion()).toBe(true)
    })
})
