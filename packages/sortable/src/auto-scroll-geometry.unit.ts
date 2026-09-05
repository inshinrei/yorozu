import { describe, expect, it } from "vitest"
import { computeAutoScrollDelta, computeAutoScrollDelta1d, computeAutoScrollDeltaX } from "./auto-scroll-geometry"

describe("computeAutoScrollDelta", () => {
    let rect = { top: 100, bottom: 400 }
    let zone = 60
    let maxStep = 18

    it("returns 0 when pointer is in the middle", () => {
        expect(computeAutoScrollDelta(250, rect, zone, maxStep)).toBe(0)
    })

    it("returns 0 when viewport is too short", () => {
        expect(computeAutoScrollDelta(102, { top: 100, bottom: 103 }, zone, maxStep)).toBe(0)
    })

    it("scrolls up when pointer is near the top edge", () => {
        let delta = computeAutoScrollDelta(120, rect, zone, maxStep)
        expect(delta).toBeLessThan(0)
        expect(delta).toBeGreaterThanOrEqual(-maxStep)
    })

    it("scrolls down when pointer is near the bottom edge", () => {
        let delta = computeAutoScrollDelta(380, rect, zone, maxStep)
        expect(delta).toBeGreaterThan(0)
        expect(delta).toBeLessThanOrEqual(maxStep)
    })

    it("is stronger when closer to the edge (quadratic)", () => {
        let near = computeAutoScrollDelta(105, rect, zone, maxStep)
        let far = computeAutoScrollDelta(140, rect, zone, maxStep)
        expect(Math.abs(near)).toBeGreaterThan(Math.abs(far))
    })

    it("returns 0 when pointer is outside the viewport", () => {
        expect(computeAutoScrollDelta(50, rect, zone, maxStep)).toBe(0)
        expect(computeAutoScrollDelta(450, rect, zone, maxStep)).toBe(0)
    })
})

describe("computeAutoScrollDelta1d / X", () => {
    let range = { start: 100, end: 400 }
    let zone = 60
    let maxStep = 18

    it("is identical to Y wrapper for the same numbers", () => {
        expect(computeAutoScrollDelta1d(120, range, zone, maxStep)).toBe(
            computeAutoScrollDelta(120, { top: 100, bottom: 400 }, zone, maxStep),
        )
    })

    it("scrolls left when pointer is near the left edge", () => {
        let delta = computeAutoScrollDeltaX(120, { left: 100, right: 400 }, zone, maxStep)
        expect(delta).toBeLessThan(0)
        expect(delta).toBeGreaterThanOrEqual(-maxStep)
    })

    it("scrolls right when pointer is near the right edge", () => {
        let delta = computeAutoScrollDeltaX(380, { left: 100, right: 400 }, zone, maxStep)
        expect(delta).toBeGreaterThan(0)
        expect(delta).toBeLessThanOrEqual(maxStep)
    })

    it("returns 0 when pointer is outside the range", () => {
        expect(computeAutoScrollDeltaX(50, { left: 100, right: 400 }, zone, maxStep)).toBe(0)
        expect(computeAutoScrollDeltaX(450, { left: 100, right: 400 }, zone, maxStep)).toBe(0)
    })
})
