import { describe, expect, it } from "vitest"
import { centerFitInViewport, fitContain } from "./fit"

describe("fitContain", () => {
    it("returns null for non-positive inputs", () => {
        expect(fitContain({ width: 0, height: 100 }, { width: 200, height: 200 })).toBeNull()
        expect(fitContain({ width: 100, height: 100 }, { width: 0, height: 200 })).toBeNull()
    })

    it("keeps natural when it already fits (no upscale)", () => {
        expect(fitContain({ width: 200, height: 100 }, { width: 800, height: 600 })).toEqual({
            width: 200,
            height: 100,
        })
    })

    it("scales down to fit width", () => {
        expect(fitContain({ width: 2000, height: 1000 }, { width: 1000, height: 800 })).toEqual({
            width: 1000,
            height: 500,
        })
    })

    it("scales down to fit height", () => {
        expect(fitContain({ width: 1000, height: 2000 }, { width: 800, height: 1000 })).toEqual({
            width: 500,
            height: 1000,
        })
    })
})

describe("centerFitInViewport", () => {
    it("centers fit box inside padded viewport", () => {
        let rect = centerFitInViewport(
            { width: 100, height: 50 },
            { width: 400, height: 300 },
            { top: 20, right: 10, bottom: 20, left: 10 },
        )
        expect(rect).toEqual({
            top: 20 + (260 - 50) / 2,
            left: 10 + (380 - 100) / 2,
            width: 100,
            height: 50,
        })
    })
})
