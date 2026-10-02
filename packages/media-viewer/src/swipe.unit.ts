import { MOTION_NAV_MS, MOTION_SETTLE_MS } from "@yorozu/animations"
import { describe, expect, it } from "vitest"
import {
    MEDIA_SWIPE_SLIDE_GAP_DESKTOP_PX,
    MEDIA_SWIPE_SLIDE_GAP_MOBILE_MAX_PX,
    MEDIA_SWIPE_SLIDE_GAP_PX,
    MEDIA_SWIPE_PARALLAX_FACTOR,
    MEDIA_SWIPE_X_THRESHOLD,
    MEDIA_SWIPE_Y_THRESHOLD,
    clampSwipeOffsetX,
    clampSwipeOffsetY,
    commitSwipe,
    horizontalSlideStepPx,
    lastDeltaAgrees,
    mediaPagerFieldActive,
    mediaSwipeParallaxScale,
    mediaSwipeParallaxTransformStyle,
    mediaSwipeParallaxX,
    mediaSwipeSlideGapPx,
    projectSwipeOffset,
    rebasedOffsetAfterNav,
    resolveSwipeAxis,
    swipeSettleDurationMs,
    verticalDismissOpacity,
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
            let limit = 1000 + MEDIA_SWIPE_SLIDE_GAP_DESKTOP_PX
            expect(clampSwipeOffsetX(5000, 1000)).toBe(limit)
            expect(clampSwipeOffsetX(-5000, 1000)).toBe(-limit)
            expect(clampSwipeOffsetX(100, 1000)).toBe(100)
        })

        it("limits vertical to viewport height and not below 0", () => {
            expect(clampSwipeOffsetY(2000, 800)).toBe(800)
            expect(clampSwipeOffsetY(-100, 800)).toBe(0)
            expect(clampSwipeOffsetY(-2000, 800)).toBe(0)
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
        it("closes on vertical down past threshold and is none on vertical up", () => {
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
            ).toBe("none")
        })

        it("does not close on unlocked-axis upward past threshold", () => {
            expect(
                commitSwipe({
                    axis: "none",
                    offsetX: 0,
                    offsetY: -MEDIA_SWIPE_Y_THRESHOLD - 1,
                    canOlder: true,
                    canNewer: true,
                }),
            ).toBe("none")
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

        it("commits horizontal past threshold even when last delta reversed", () => {
            expect(
                commitSwipe({
                    axis: "horizontal",
                    offsetX: -80,
                    offsetY: 0,
                    canOlder: true,
                    canNewer: true,
                    lastDeltaX: 5,
                }),
            ).toBe("newer")
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

    describe("rebasedOffsetAfterNav", () => {
        it("shifts by one slide step so neighbor stays under the finger after swap", () => {
            let step = horizontalSlideStepPx(1000)
            expect(step).toBe(1000 + MEDIA_SWIPE_SLIDE_GAP_DESKTOP_PX)
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

    it("swipeSettleDurationMs uses motion tokens", () => {
        expect(swipeSettleDurationMs("nav", false)).toBe(MOTION_NAV_MS)
        expect(swipeSettleDurationMs("bounce", false)).toBe(MOTION_SETTLE_MS)
        expect(swipeSettleDurationMs("nav", true)).toBe(0)
        expect(swipeSettleDurationMs("bounce", true)).toBe(0)
    })
})

describe("mediaPagerFieldActive", () => {
    it("is off at rest and on for nonzero horizontal offset", () => {
        expect(mediaPagerFieldActive(0, 0, false)).toBe(false)
        expect(mediaPagerFieldActive(40, 0, false)).toBe(true)
        expect(mediaPagerFieldActive(-40, 0, false)).toBe(true)
    })

    it("is off while dismissing or offsetY is down", () => {
        expect(mediaPagerFieldActive(40, 10, false)).toBe(false)
        expect(mediaPagerFieldActive(40, 0, true)).toBe(false)
        expect(mediaPagerFieldActive(0, 80, false)).toBe(false)
    })
})

describe("mediaSwipeSlideGapPx", () => {
    it("is 40 at mobile max and 80 above", () => {
        expect(mediaSwipeSlideGapPx(640)).toBe(MEDIA_SWIPE_SLIDE_GAP_PX)
        expect(mediaSwipeSlideGapPx(MEDIA_SWIPE_SLIDE_GAP_MOBILE_MAX_PX)).toBe(40)
        expect(mediaSwipeSlideGapPx(641)).toBe(MEDIA_SWIPE_SLIDE_GAP_DESKTOP_PX)
        expect(mediaSwipeSlideGapPx(0)).toBe(80)
        expect(horizontalSlideStepPx(1000)).toBe(1080)
        expect(horizontalSlideStepPx(640)).toBe(680)
    })
})

describe("mediaSwipeParallaxX", () => {
    it("is 0 at rest, when not live, or when reduced", () => {
        let base = { offsetX: -80, side: "active" as const, viewportWidth: 1000 }
        expect(mediaSwipeParallaxX({ ...base, live: false, reduced: false })).toBe(0)
        expect(mediaSwipeParallaxX({ ...base, live: true, reduced: true })).toBe(0)
        expect(mediaSwipeParallaxX({ ...base, offsetX: 0, live: true, reduced: false })).toBe(0)
    })

    it("lags the page by 0.14 of pane translation", () => {
        let live = { live: true, reduced: false, offsetX: -80, viewportWidth: 1000 }
        expect(mediaSwipeParallaxX({ ...live, side: "active" })).toBeCloseTo(11.2, 5)
        expect(mediaSwipeParallaxX({ ...live, side: "older" })).toBeCloseTo(162.4, 5)
        expect(mediaSwipeParallaxX({ ...live, side: "newer" })).toBeCloseTo(-140, 5)
        expect(MEDIA_SWIPE_PARALLAX_FACTOR).toBe(0.14)
    })
})

describe("mediaSwipeParallaxScale", () => {
    it("is 1 at rest and when clip width is 0", () => {
        expect(mediaSwipeParallaxScale(0, 200)).toBe(1)
        expect(mediaSwipeParallaxScale(14, 0)).toBe(1)
        expect(mediaSwipeParallaxScale(14, 200)).toBeCloseTo(1.14, 5)
    })
})

describe("mediaSwipeParallaxTransformStyle", () => {
    it("is empty at rest identity", () => {
        expect(mediaSwipeParallaxTransformStyle(0, 1)).toBe("")
        expect(mediaSwipeParallaxTransformStyle(11.2, 1)).toBe("translate3d(11.2px, 0, 0) scale(1)")
    })
})
