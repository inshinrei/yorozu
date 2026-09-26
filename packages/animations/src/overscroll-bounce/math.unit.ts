import { describe, expect, it } from "vitest"
import {
    OVERSCROLL_APPKIT_STIFFNESS,
    OVERSCROLL_COEFF,
    OVERSCROLL_SPRING_MAX_MS,
    OVERSCROLL_SPRING_RATE,
    elasticOverscrollAt,
    invertOverscrollVisual,
    overscrollVisual,
    rubberBandAppKit,
    rubberBandOverscroll,
} from "./math"

describe("rubberBandOverscroll", () => {
    it("uses iOS coeff 0.55 and the chpwn map", () => {
        expect(OVERSCROLL_COEFF).toBe(0.55)
        let dim = 480
        let c = OVERSCROLL_COEFF
        let expected = (x: number): number => (1 - 1 / ((x * c) / dim + 1)) * dim
        expect(rubberBandOverscroll(0, dim)).toBe(0)
        expect(rubberBandOverscroll(10, dim)).toBeCloseTo(expected(10), 10)
        expect(rubberBandOverscroll(100, dim)).toBeCloseTo(expected(100), 10)
        expect(rubberBandOverscroll(480, dim)).toBeCloseTo(expected(480), 10)
        expect(rubberBandOverscroll(-10, dim)).toBeCloseTo(-expected(10), 10)
    })

    it("returns 0 for non-positive dim, coeff, or overscroll 0", () => {
        expect(rubberBandOverscroll(40, 0)).toBe(0)
        expect(rubberBandOverscroll(40, -10)).toBe(0)
        expect(rubberBandOverscroll(40, 480, 0)).toBe(0)
        expect(rubberBandOverscroll(40, 480, -1)).toBe(0)
        expect(rubberBandOverscroll(0, 480)).toBe(0)
    })
})

describe("rubberBandAppKit", () => {
    it("uses stiffness 20", () => {
        expect(OVERSCROLL_APPKIT_STIFFNESS).toBe(20)
        expect(rubberBandAppKit(0)).toBe(0)
        expect(rubberBandAppKit(10)).toBeCloseTo(0.5, 3)
        expect(rubberBandAppKit(100)).toBeCloseTo(5, 3)
        expect(rubberBandAppKit(480)).toBeCloseTo(24, 3)
        expect(rubberBandAppKit(-100)).toBeCloseTo(-5, 3)
        expect(rubberBandAppKit(100, 0)).toBe(0)
    })
})

describe("elasticOverscrollAt", () => {
    it("is the AppKit exponential", () => {
        expect(OVERSCROLL_SPRING_RATE).toBe(12.5)
        expect(OVERSCROLL_SPRING_MAX_MS).toBe(500)
        expect(elasticOverscrollAt(20, 0, 0)).toBe(20)
        expect(elasticOverscrollAt(20, 0, 0.24)).toBeCloseTo(0.9957, 3)
        expect(elasticOverscrollAt(50, 0, 0.25)).toBeCloseTo(2.197, 3)
    })
})

describe("invertOverscrollVisual", () => {
    it("inverts appkit and ios maps", () => {
        expect(invertOverscrollVisual(5, "appkit", 480)).toBeCloseTo(100, 3)
        expect(invertOverscrollVisual(rubberBandOverscroll(80, 480), "ios", 480)).toBeCloseTo(80, 3)
        expect(overscrollVisual(80, "appkit", 480)).toBeCloseTo(4, 3)
        expect(overscrollVisual(80, "ios", 480)).toBeCloseTo(rubberBandOverscroll(80, 480), 10)
    })
})
