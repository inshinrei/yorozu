import { describe, expect, it } from "vitest"
import {
    boundTranslate,
    clampScale,
    nextScaleFromWheel,
    PINCH_MAX_SCALE,
    PINCH_MIN_SCALE,
    PINCH_WHEEL_FACTOR,
    resetZoom,
    zoomAtOrigin,
    zoomTransform,
} from "./math"

describe("clampScale", () => {
    it("clamps and treats non-finite as min", () => {
        expect(PINCH_MIN_SCALE).toBe(1)
        expect(PINCH_MAX_SCALE).toBe(20)
        expect(clampScale(0.5, 1, 5)).toBe(1)
        expect(clampScale(9, 1, 5)).toBe(5)
        expect(clampScale(2.5, 1, 5)).toBe(2.5)
        expect(clampScale(Number.NaN, 1, 5)).toBe(1)
        expect(clampScale(Number.POSITIVE_INFINITY, 1, 5)).toBe(1)
    })
})

describe("zoomAtOrigin", () => {
    it("keeps the origin stable when scaling up", () => {
        let next = zoomAtOrigin({ scale: 1, translateX: 0, translateY: 0 }, 2, { offsetX: 40, offsetY: 0 }, 200, 200, 200, 200)
        expect(next.scale).toBe(2)
        expect(next.translateX).toBe(-40)
        expect(next.translateY).toBe(0)
    })

    it("clamps the next scale to the pinch range", () => {
        let next = zoomAtOrigin({ scale: 1, translateX: 0, translateY: 0 }, 80, { offsetX: 0, offsetY: 0 }, 200, 200, 200, 200)
        expect(next.scale).toBe(PINCH_MAX_SCALE)
    })
})

describe("boundTranslate", () => {
    it("zeros pan when the image still fits", () => {
        expect(boundTranslate(20, 10, 1, 100, 100, 100, 100)).toEqual({ translateX: 0, translateY: 0 })
    })

    it("clamps pan to the overflow half-extent", () => {
        expect(boundTranslate(999, -999, 2, 200, 200, 200, 200)).toEqual({ translateX: 100, translateY: -100 })
    })
})

describe("resetZoom", () => {
    it("returns identity", () => {
        expect(resetZoom()).toEqual({ scale: 1, translateX: 0, translateY: 0 })
    })
})

describe("zoomTransform", () => {
    it("serializes translate then scale", () => {
        expect(zoomTransform({ scale: 2, translateX: -40, translateY: 10 })).toBe(
            "translate3d(-40px, 10px, 0) scale(2)",
        )
    })
})

describe("nextScaleFromWheel", () => {
    it("doubles scale for the matching ctrl-wheel delta", () => {
        expect(PINCH_WHEEL_FACTOR).toBe(0.01)
        expect(nextScaleFromWheel(1, -Math.log(2) / PINCH_WHEEL_FACTOR)).toBeCloseTo(2)
        expect(nextScaleFromWheel(2, Math.log(2) / PINCH_WHEEL_FACTOR)).toBeCloseTo(1)
        expect(nextScaleFromWheel(1, -10_000)).toBe(PINCH_MAX_SCALE)
    })
})
