import { describe, expect, it } from "vitest"
import {
    MEDIA_MIN_SCALE,
    MEDIA_PAN_INERTIA_COAST_MS,
    MEDIA_PAN_INERTIA_MIN_SPEED_PX_MS,
    MEDIA_WHEEL_ZOOM_RELEASE_MS,
    canZoomIn,
    canZoomOut,
    formatZoomPercent,
    legalizeZoomState,
    lerpZoomState,
    maxScaleFromNatural,
    projectPanInertia,
    resetZoom,
    scaleByRelativeAmount,
    softScaleLimits,
    stepScale,
    velocityFromSamples,
    wheelIntent,
    wheelPanDeltas,
    wheelZoomAmount,
    zoomSettleDurationMs,
    zoomStateDistance,
    zoomStatesNearlyEqual,
} from "./zoom"
import { boundTranslate, clampScale, zoomAtOrigin } from "@yorozu/animations"

describe("media-viewer zoom math", () => {
    describe("clampScale / maxScaleFromNatural", () => {
        it("clamps to min/max and rejects non-finite", () => {
            expect(clampScale(0.5, 1, 5)).toBe(1)
            expect(clampScale(9, 1, 5)).toBe(5)
            expect(clampScale(2.5, 1, 5)).toBe(2.5)
            expect(clampScale(Number.NaN, 1, 5)).toBe(1)
        })

        it("max scale is maxFactor (digital zoom past natural allowed)", () => {
            expect(maxScaleFromNatural(400, 2000, 20)).toBe(20)
            expect(maxScaleFromNatural(400, 200, 20)).toBe(20)
            expect(maxScaleFromNatural(0, 0, 20)).toBe(20)
            expect(maxScaleFromNatural(400, 8000, 10)).toBe(10)
            expect(maxScaleFromNatural(400, 200, 0.5)).toBe(MEDIA_MIN_SCALE)
        })
    })

    describe("canZoom / stepScale", () => {
        it("reports zoom limits", () => {
            expect(canZoomIn(1, 4)).toBe(true)
            expect(canZoomIn(4, 4)).toBe(false)
            expect(canZoomOut(1)).toBe(false)
            expect(canZoomOut(1.5)).toBe(true)
        })

        it("steps in and out with clamp", () => {
            expect(stepScale(1, "in", 10, 1.25)).toBe(1.25)
            expect(stepScale(1.25, "out", 10, 1.25)).toBe(1)
            expect(stepScale(9, "in", 10, 1.25)).toBe(10)
            expect(stepScale(1.1, "out", 10, 1.25)).toBe(1)
        })
    })

    describe("boundTranslate / zoomAtOrigin", () => {
        it("zero pan when image fits viewport", () => {
            expect(boundTranslate(50, 50, 1, 200, 100, 400, 300)).toEqual({ translateX: 0, translateY: 0 })
        })

        it("clamps pan when scaled beyond viewport", () => {
            expect(boundTranslate(500, -400, 2, 400, 300, 400, 300)).toEqual({
                translateX: 200,
                translateY: -150,
            })
        })

        it("zooms toward origin and bounds result", () => {
            let next = zoomAtOrigin(
                { scale: 1, translateX: 0, translateY: 0 },
                2,
                { offsetX: 100, offsetY: 50 },
                400,
                300,
                400,
                300,
                1,
                10,
            )
            expect(next.scale).toBe(2)
            expect(next.translateX).toBe(-100)
            expect(next.translateY).toBe(-50)
        })

        it("resets translate when returning to fit", () => {
            let next = zoomAtOrigin(
                { scale: 2, translateX: 40, translateY: -20 },
                1,
                { offsetX: 0, offsetY: 0 },
                400,
                300,
                400,
                300,
            )
            expect(next).toEqual({ scale: 1, translateX: 0, translateY: 0 })
        })
    })

    describe("helpers", () => {
        it("resetZoom returns identity", () => {
            expect(resetZoom()).toEqual({ scale: 1, translateX: 0, translateY: 0 })
        })

        it("formatZoomPercent rounds and floors at 100%", () => {
            expect(formatZoomPercent(1)).toBe("100%")
            expect(formatZoomPercent(1.25)).toBe("125%")
            expect(formatZoomPercent(0.5)).toBe("100%")
        })

        it("wheelZoomAmount is trackpad-sensitive and caps large mouse deltas", () => {
            expect(wheelZoomAmount(-10)).toBeCloseTo(10 / 90, 5)
            expect(wheelZoomAmount(10)).toBeCloseTo(-10 / 90, 5)
            expect(wheelZoomAmount(-900)).toBe(0.55)
            expect(wheelZoomAmount(900)).toBe(-0.55)
            expect(scaleByRelativeAmount(1, 0.5, 10)).toBe(1.5)
            expect(scaleByRelativeAmount(2, -0.5, 10)).toBe(1)
            expect(scaleByRelativeAmount(9, 1, 10)).toBe(10)
        })

        it("wheelPanDeltas normalizes deltaMode and applies sensitivity/flick gain", () => {
            let tiny = wheelPanDeltas(1, 0, 0, 16, 800, 1)
            expect(tiny.deltaX).toBeGreaterThan(1)
            expect(tiny.deltaX).toBeLessThan(2)

            let lines = wheelPanDeltas(2, -3, 1, 16, 800, 1)
            expect(lines.deltaX).toBeGreaterThan(32)
            expect(lines.deltaY).toBeLessThan(-48)

            let boosted = wheelPanDeltas(10, 0, 0, 16, 800, 2.75)
            let baseline = wheelPanDeltas(10, 0, 0, 16, 800, 1)
            expect(boosted.deltaX / baseline.deltaX).toBeCloseTo(2.75, 5)
        })

        it("wheelIntent is zoom on ctrl, pan when zoomed, else swipe", () => {
            expect(wheelIntent(false, true)).toBe("zoom")
            expect(wheelIntent(true, false)).toBe("pan")
            expect(wheelIntent(false, false)).toBe("swipe")
            expect(wheelIntent(true, true)).toBe("zoom")
        })
    })

    describe("pan inertia / settle math", () => {
        it("velocityFromSamples averages over the look-back window", () => {
            let samples = [
                { t: 0, x: 0, y: 0 },
                { t: 40, x: 40, y: -20 },
                { t: 80, x: 80, y: -40 },
            ]
            let v = velocityFromSamples(samples, 80, 80)
            expect(v.vx).toBeCloseTo(1, 5)
            expect(v.vy).toBeCloseTo(-0.5, 5)
        })

        it("velocityFromSamples is zero with a single sample or zero dt", () => {
            expect(velocityFromSamples([{ t: 10, x: 1, y: 2 }], 10)).toEqual({ vx: 0, vy: 0 })
            expect(velocityFromSamples([], 0)).toEqual({ vx: 0, vy: 0 })
        })

        it("projectPanInertia coasts along velocity then hard-bounds", () => {
            let state = { scale: 2, translateX: 0, translateY: 0 }
            let coast = projectPanInertia(state, { vx: 1, vy: 0 }, 400, 300, 400, 300)
            expect(coast.scale).toBe(2)
            expect(coast.translateX).toBeCloseTo(Math.min(200, 1 * MEDIA_PAN_INERTIA_COAST_MS), 5)
            expect(coast.translateY).toBe(0)

            let clamped = projectPanInertia(
                { scale: 2, translateX: 190, translateY: 0 },
                { vx: 2, vy: 0 },
                400,
                300,
                400,
                300,
            )
            expect(clamped.translateX).toBe(200)
        })

        it("projectPanInertia ignores sub-threshold speed", () => {
            let state = { scale: 2, translateX: 10, translateY: -5 }
            let slow = MEDIA_PAN_INERTIA_MIN_SPEED_PX_MS * 0.5
            let next = projectPanInertia(state, { vx: slow, vy: 0 }, 400, 300, 400, 300)
            expect(next).toEqual(state)
        })

        it("softScaleLimits expand hard min/max", () => {
            let soft = softScaleLimits(1, 20)
            expect(soft.min).toBeCloseTo(0.2, 5)
            expect(soft.max).toBeCloseTo(23, 5)
        })

        it("MEDIA_WHEEL_ZOOM_RELEASE_MS is 150", () => {
            expect(MEDIA_WHEEL_ZOOM_RELEASE_MS).toBe(150)
        })

        it("legalizeZoomState clamps soft-overshot scale and bounds pan", () => {
            let over = legalizeZoomState(
                { scale: 22, translateX: 0, translateY: 0 },
                { offsetX: 0, offsetY: 0 },
                400,
                300,
                400,
                300,
                1,
                20,
            )
            expect(over.scale).toBe(20)

            let under = legalizeZoomState(
                { scale: 0.7, translateX: 40, translateY: -10 },
                null,
                400,
                300,
                400,
                300,
                1,
                20,
            )
            expect(under).toEqual({ scale: 1, translateX: 0, translateY: 0 })
        })

        it("zoomSettleDurationMs / lerp / distance / nearlyEqual helpers", () => {
            expect(zoomSettleDurationMs(0)).toBe(160)
            expect(zoomSettleDurationMs(10_000)).toBe(350)

            let mid = lerpZoomState(
                { scale: 1, translateX: 0, translateY: 0 },
                { scale: 3, translateX: 100, translateY: -50 },
                0.5,
            )
            expect(mid.scale).toBe(2)
            expect(mid.translateX).toBe(50)
            expect(mid.translateY).toBe(-25)

            expect(
                zoomStatesNearlyEqual(
                    { scale: 2, translateX: 10, translateY: 0 },
                    { scale: 2, translateX: 10.01, translateY: 0 },
                ),
            ).toBe(true)
            expect(
                zoomStatesNearlyEqual(
                    { scale: 2, translateX: 0, translateY: 0 },
                    { scale: 2, translateX: 40, translateY: 0 },
                ),
            ).toBe(false)

            expect(
                zoomStateDistance(
                    { scale: 1, translateX: 0, translateY: 0 },
                    { scale: 1, translateX: 30, translateY: 40 },
                    400,
                    300,
                ),
            ).toBe(50)
        })
    })
})
