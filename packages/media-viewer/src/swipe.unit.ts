import { describe, expect, it } from "vitest"
import {
    MEDIA_SWIPE_SETTLE_MS,
    MEDIA_SWIPE_SETTLE_MS_MIN,
    MEDIA_SWIPE_SLIDE_GAP_PX,
    MEDIA_SWIPE_WHEEL_EARLY_FACTOR,
    MEDIA_SWIPE_X_THRESHOLD,
    MEDIA_SWIPE_Y_THRESHOLD,
    clampSwipeOffsetX,
    clampSwipeOffsetY,
    commitSwipe,
    horizontalSlideStepPx,
    lastDeltaAgrees,
    projectSwipeOffset,
    rebasedOffsetAfterNav,
    resolveSwipeAxis,
    settleDurationMs,
    shouldEarlyCommitWheel,
    verticalDismissOpacity,
    wheelEarlyThresholdPx,
} from "./swipe"

describe("media-viewer swipe math", () => {
    describe("resolveSwipeAxis", () => {
        it("stays none for tiny offsets", () => {
            expect(resolveSwipeAxis("none", 3, 2)).toBe("none")
        })

        it("locks horizontal when X dominates", () => {
            expect(resolveSwipeAxis("none", 20, 2)).toBe("horizontal")
            expect(resolveSwipeAxis("none", 30, 10)).toBe("horizontal")
        })

        it("locks vertical when Y dominates", () => {
            expect(resolveSwipeAxis("none", 2, 20)).toBe("vertical")
            expect(resolveSwipeAxis("none", 10, 30)).toBe("vertical")
        })

        it("keeps a locked axis", () => {
            expect(resolveSwipeAxis("horizontal", 0, 100)).toBe("horizontal")
            expect(resolveSwipeAxis("vertical", 100, 0)).toBe("vertical")
        })
    })

    describe("projectSwipeOffset", () => {
        it("zeros the non-active axis", () => {
            expect(projectSwipeOffset("horizontal", 40, -20)).toEqual({ x: 40, y: 0 })
            expect(projectSwipeOffset("vertical", 40, -20)).toEqual({ x: 0, y: -20 })
            expect(projectSwipeOffset("none", 40, -20)).toEqual({ x: 0, y: 0 })
        })
    })

    describe("clampSwipeOffset", () => {
        it("limits horizontal to one viewport + gap", () => {
            let limit = 1000 + MEDIA_SWIPE_SLIDE_GAP_PX
            expect(clampSwipeOffsetX(5000, 1000)).toBe(limit)
            expect(clampSwipeOffsetX(-5000, 1000)).toBe(-limit)
            expect(clampSwipeOffsetX(100, 1000)).toBe(100)
        })

        it("limits vertical to viewport height", () => {
            expect(clampSwipeOffsetY(2000, 800)).toBe(800)
            expect(clampSwipeOffsetY(-2000, 800)).toBe(-800)
        })
    })

    describe("lastDeltaAgrees", () => {
        it("allows zero lastDelta or zero offset", () => {
            expect(lastDeltaAgrees(-80, 0)).toBe(true)
            expect(lastDeltaAgrees(0, -5)).toBe(true)
        })

        it("requires matching signs when both non-zero", () => {
            expect(lastDeltaAgrees(-80, -4)).toBe(true)
            expect(lastDeltaAgrees(80, 3)).toBe(true)
            expect(lastDeltaAgrees(-80, 4)).toBe(false)
            expect(lastDeltaAgrees(80, -3)).toBe(false)
        })
    })

    describe("commitSwipe", () => {
        it("closes on vertical past threshold", () => {
            expect(
                commitSwipe({
                    axis: "vertical",
                    offsetX: 0,
                    offsetY: MEDIA_SWIPE_Y_THRESHOLD,
                    canOlder: true,
                    canNewer: true,
                }),
            ).toBe("close")
            expect(
                commitSwipe({
                    axis: "vertical",
                    offsetX: 0,
                    offsetY: -MEDIA_SWIPE_Y_THRESHOLD - 1,
                    canOlder: true,
                    canNewer: true,
                }),
            ).toBe("close")
        })

        it("does not close on vertical under threshold", () => {
            expect(
                commitSwipe({
                    axis: "vertical",
                    offsetX: 0,
                    offsetY: 20,
                    canOlder: true,
                    canNewer: true,
                }),
            ).toBe("bounce")
        })

        it("maps horizontal left to newer and right to older", () => {
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: -MEDIA_SWIPE_X_THRESHOLD,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: true,
                    lastDeltaX: -2,
                }),
            ).toBe("newer")
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: MEDIA_SWIPE_X_THRESHOLD,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: true,
                    lastDeltaX: 2,
                }),
            ).toBe("older")
        })

        it("bounces horizontal under threshold", () => {
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: -20,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: true,
                    lastDeltaX: -10,
                }),
            ).toBe("bounce")
        })

        it("bounces when last delta reverses past distance threshold (reverse-cancel)", () => {
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: -80,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: true,
                    lastDeltaX: 5,
                }),
            ).toBe("bounce")
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: 80,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: true,
                    lastDeltaX: -5,
                }),
            ).toBe("bounce")
        })

        it("commits when past distance and last delta is zero", () => {
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: -80,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: true,
                    lastDeltaX: 0,
                }),
            ).toBe("newer")
        })

        it("bounces horizontal at edge when nav is exhausted", () => {
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: -80,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: false,
                    lastDeltaX: -4,
                }),
            ).toBe("bounce")
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: 80,
                    offsetY: 0,
                    canOlder: false,
                    canNewer: true,
                    lastDeltaX: 4,
                }),
            ).toBe("bounce")
        })
    })

    describe("shouldEarlyCommitWheel", () => {
        it("is true past 2× threshold on the locked axis", () => {
            let earlyX = wheelEarlyThresholdPx(MEDIA_SWIPE_X_THRESHOLD)
            expect(earlyX).toBe(MEDIA_SWIPE_X_THRESHOLD * MEDIA_SWIPE_WHEEL_EARLY_FACTOR)
            expect(shouldEarlyCommitWheel("horizontal", earlyX + 1, 0)).toBe(true)
            expect(shouldEarlyCommitWheel("horizontal", earlyX, 0)).toBe(false)
            expect(shouldEarlyCommitWheel("vertical", 0, earlyX + 1)).toBe(true)
            expect(shouldEarlyCommitWheel("none", earlyX + 1, earlyX + 1)).toBe(false)
        })
    })

    describe("rebasedOffsetAfterNav", () => {
        it("shifts by one slide step so neighbor stays under the finger after swap", () => {
            let step = horizontalSlideStepPx(1000)
            expect(step).toBe(1000 + MEDIA_SWIPE_SLIDE_GAP_PX)
            expect(rebasedOffsetAfterNav(-200, "newer", 1000)).toBe(-200 + step)
            expect(rebasedOffsetAfterNav(200, "older", 1000)).toBe(200 - step)
        })
    })

    describe("verticalDismissOpacity", () => {
        it("stays near 1 for small offsets and floors at 0.45", () => {
            expect(verticalDismissOpacity(0, 800)).toBe(1)
            expect(verticalDismissOpacity(800, 800)).toBe(0.45)
            expect(verticalDismissOpacity(40, 800)).toBeGreaterThan(0.85)
        })
    })

    describe("settleDurationMs", () => {
        it("scales with remaining distance", () => {
            expect(settleDurationMs(0, 1000)).toBe(MEDIA_SWIPE_SETTLE_MS_MIN)
            expect(settleDurationMs(1000, 1000)).toBe(MEDIA_SWIPE_SETTLE_MS)
            expect(settleDurationMs(200, 1000)).toBeGreaterThan(MEDIA_SWIPE_SETTLE_MS_MIN)
            expect(settleDurationMs(200, 1000)).toBeLessThan(MEDIA_SWIPE_SETTLE_MS)
        })
    })
})
