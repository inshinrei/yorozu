import { describe, expect, it } from "vitest"
import { OVERSCROLL_COEFF, rubberBandOverscroll } from "./math"

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
