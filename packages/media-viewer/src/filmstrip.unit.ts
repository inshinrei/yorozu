import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
    MEDIA_SWIPE_SLIDE_GAP_DESKTOP_PX,
    MEDIA_SWIPE_SLIDE_GAP_MOBILE_MAX_PX,
    MEDIA_SWIPE_SLIDE_GAP_PX,
} from "./swipe"
import {
    FILMSTRIP_EDGE_FADE_EPS_PX,
    FILMSTRIP_SWIPE_SLIDE_GAP_DESKTOP_PX,
    FILMSTRIP_SWIPE_SLIDE_GAP_MOBILE_MAX_PX,
    FILMSTRIP_SWIPE_SLIDE_GAP_PX,
    filmstripCentersScrollLeft,
    filmstripCurrentWidthPx,
    filmstripEdgeFade,
    filmstripEndInsetPx,
    filmstripGapAfter,
    filmstripGapAfterAtProgress,
    filmstripInterpolatedWidthPx,
    filmstripOverflows,
    filmstripSwipeNeighborIndex,
    filmstripSwipeProgress,
    filmstripSwipeSlideGapPx,
    filmstripThumbPitchPx,
} from "./filmstrip"

describe("filmstripCurrentWidthPx", () => {
    let base = { neighborWidth: 44, height: 64, cap: 160 }

    it("uses 16:9 aspect under the cap", () => {
        expect(filmstripCurrentWidthPx({ ...base, naturalWidth: 16, naturalHeight: 9 })).toBeCloseTo(64 * (16 / 9), 5)
    })

    it("caps landscape at 2.5× height", () => {
        expect(filmstripCurrentWidthPx({ ...base, naturalWidth: 4000, naturalHeight: 1000 })).toBe(160)
    })

    it("uses square at height when above neighbor", () => {
        expect(filmstripCurrentWidthPx({ ...base, naturalWidth: 1, naturalHeight: 1 })).toBe(64)
    })

    it("floors portrait at neighbor width", () => {
        expect(filmstripCurrentWidthPx({ ...base, naturalWidth: 9, naturalHeight: 16 })).toBe(44)
    })

    it("returns neighbor width when aspect is missing", () => {
        expect(filmstripCurrentWidthPx(base)).toBe(44)
        expect(filmstripCurrentWidthPx({ ...base, naturalWidth: 16, naturalHeight: 0 })).toBe(44)
        expect(filmstripCurrentWidthPx({ ...base, naturalWidth: 0, naturalHeight: 9 })).toBe(44)
    })

    it("floors cap at neighbor width", () => {
        expect(filmstripCurrentWidthPx({ ...base, cap: 40, naturalWidth: 16, naturalHeight: 9 })).toBe(44)
    })
})

describe("filmstripGapAfter", () => {
    it("uses currentGap on current and the left neighbor", () => {
        expect(filmstripGapAfter(4, 5, 2, 8)).toBe(8)
        expect(filmstripGapAfter(5, 5, 2, 8)).toBe(8)
        expect(filmstripGapAfter(6, 5, 2, 8)).toBe(2)
        expect(filmstripGapAfter(0, 0, 2, 8)).toBe(8)
        expect(filmstripGapAfter(1, 0, 2, 8)).toBe(2)
    })
})

describe("filmstripThumbPitchPx", () => {
    it("adds gapAfter to content width", () => {
        expect(filmstripThumbPitchPx(44, 2)).toBe(46)
        expect(filmstripThumbPitchPx(114, 8)).toBe(122)
    })
})

describe("filmstripOverflows", () => {
    it("is false when total fits", () => {
        expect(filmstripOverflows(200, 200)).toBe(false)
        expect(filmstripOverflows(199, 200)).toBe(false)
    })

    it("is true when total exceeds the viewport, including subpixels", () => {
        expect(filmstripOverflows(201, 200)).toBe(true)
        expect(filmstripOverflows(200.5, 200)).toBe(true)
    })
})

describe("FILMSTRIP_SWIPE_SLIDE_GAP_PX", () => {
    it("matches swipe gap constants", () => {
        expect(FILMSTRIP_SWIPE_SLIDE_GAP_PX).toBe(MEDIA_SWIPE_SLIDE_GAP_PX)
        expect(FILMSTRIP_SWIPE_SLIDE_GAP_DESKTOP_PX).toBe(MEDIA_SWIPE_SLIDE_GAP_DESKTOP_PX)
        expect(FILMSTRIP_SWIPE_SLIDE_GAP_MOBILE_MAX_PX).toBe(MEDIA_SWIPE_SLIDE_GAP_MOBILE_MAX_PX)
        expect(filmstripSwipeSlideGapPx(640)).toBe(40)
        expect(filmstripSwipeSlideGapPx(641)).toBe(80)
        expect(filmstripSwipeSlideGapPx(0)).toBe(80)
    })

    it("filmstrip.ts does not import swipe modules", () => {
        let src = readFileSync(fileURLToPath(new URL("./filmstrip.ts", import.meta.url)), "utf8")
        expect(src).not.toContain('from "./swipe"')
        expect(src).not.toContain('from "./swipe-controller"')
    })
})

describe("filmstripSwipeProgress", () => {
    it("is 0 at offset 0", () => {
        expect(filmstripSwipeProgress(0, 800)).toBe(0)
    })

    it("is 0.5 at half a slide step", () => {
        let step = 800 + 80
        expect(filmstripSwipeProgress(-(step / 2), 800)).toBe(0.5)
        expect(filmstripSwipeProgress(step / 2, 800)).toBe(0.5)
    })

    it("clamps at 1 when |offsetX| >= viewport + desktop gap", () => {
        expect(filmstripSwipeProgress(-(800 + 80), 800)).toBe(1)
        expect(filmstripSwipeProgress(800 + 80 + 10, 800)).toBe(1)
    })

    it("uses fallback width 800 when viewport is 0", () => {
        expect(filmstripSwipeProgress(0, 0)).toBe(0)
        expect(filmstripSwipeProgress(40, 0)).toBeCloseTo(40 / 880, 5)
        expect(filmstripSwipeProgress(440, 0)).toBe(0.5)
    })

    it("uses mobile gap when viewport is 640", () => {
        let step = 640 + 40
        expect(filmstripSwipeProgress(-(step / 2), 640)).toBe(0.5)
        expect(filmstripSwipeProgress(-step, 640)).toBe(1)
        expect(filmstripSwipeProgress(step + 10, 640)).toBe(1)
    })
})

describe("filmstripSwipeNeighborIndex", () => {
    it("returns null at offset 0 and when count < 2", () => {
        expect(filmstripSwipeNeighborIndex(1, 0, 3)).toBeNull()
        expect(filmstripSwipeNeighborIndex(0, -10, 1)).toBeNull()
    })

    it("returns newer when offsetX is negative", () => {
        expect(filmstripSwipeNeighborIndex(1, -10, 3)).toBe(2)
    })

    it("returns older when offsetX is positive", () => {
        expect(filmstripSwipeNeighborIndex(1, 10, 3)).toBe(0)
    })

    it("returns null at album ends", () => {
        expect(filmstripSwipeNeighborIndex(2, -10, 3)).toBeNull()
        expect(filmstripSwipeNeighborIndex(0, 10, 3)).toBeNull()
    })
})

describe("filmstripInterpolatedWidthPx", () => {
    let neighborWidth = 44
    let currentWidth = filmstripCurrentWidthPx({
        neighborWidth,
        height: 64,
        cap: 160,
        naturalWidth: 16,
        naturalHeight: 9,
    })
    let incomingWidth = filmstripCurrentWidthPx({
        neighborWidth,
        height: 64,
        cap: 160,
        naturalWidth: 1,
        naturalHeight: 1,
    })
    let incomingPortrait = filmstripCurrentWidthPx({
        neighborWidth,
        height: 64,
        cap: 160,
        naturalWidth: 9,
        naturalHeight: 16,
    })

    it("at t=0 only current is fat", () => {
        expect(
            filmstripInterpolatedWidthPx({
                index: 1,
                current: 1,
                neighborIndex: 2,
                progress: 0,
                neighborWidth,
                currentWidth,
                incomingWidth,
            }),
        ).toBe(currentWidth)
        expect(
            filmstripInterpolatedWidthPx({
                index: 2,
                current: 1,
                neighborIndex: 2,
                progress: 0,
                neighborWidth,
                currentWidth,
                incomingWidth,
            }),
        ).toBe(neighborWidth)
        expect(
            filmstripInterpolatedWidthPx({
                index: 0,
                current: 1,
                neighborIndex: 2,
                progress: 0,
                neighborWidth,
                currentWidth,
                incomingWidth,
            }),
        ).toBe(neighborWidth)
    })

    it("at t=0.5 current and incoming are both mid and differ for 16:9 vs 9:16", () => {
        let currentMid = filmstripInterpolatedWidthPx({
            index: 1,
            current: 1,
            neighborIndex: 2,
            progress: 0.5,
            neighborWidth,
            currentWidth,
            incomingWidth: incomingPortrait,
        })
        let incomingMid = filmstripInterpolatedWidthPx({
            index: 2,
            current: 1,
            neighborIndex: 2,
            progress: 0.5,
            neighborWidth,
            currentWidth,
            incomingWidth: incomingPortrait,
        })
        expect(currentMid).toBeCloseTo((currentWidth + neighborWidth) / 2, 5)
        expect(incomingMid).toBeCloseTo((neighborWidth + incomingPortrait) / 2, 5)
        expect(currentMid).not.toBe(incomingMid)
        expect(
            filmstripInterpolatedWidthPx({
                index: 0,
                current: 1,
                neighborIndex: 2,
                progress: 0.5,
                neighborWidth,
                currentWidth,
                incomingWidth: incomingPortrait,
            }),
        ).toBe(neighborWidth)
    })

    it("at t=1 only incoming is fat", () => {
        expect(
            filmstripInterpolatedWidthPx({
                index: 1,
                current: 1,
                neighborIndex: 2,
                progress: 1,
                neighborWidth,
                currentWidth,
                incomingWidth,
            }),
        ).toBe(neighborWidth)
        expect(
            filmstripInterpolatedWidthPx({
                index: 2,
                current: 1,
                neighborIndex: 2,
                progress: 1,
                neighborWidth,
                currentWidth,
                incomingWidth,
            }),
        ).toBe(incomingWidth)
        expect(
            filmstripInterpolatedWidthPx({
                index: 0,
                current: 1,
                neighborIndex: 2,
                progress: 1,
                neighborWidth,
                currentWidth,
                incomingWidth,
            }),
        ).toBe(neighborWidth)
    })

    it("returns rest widths when neighborIndex is null", () => {
        expect(
            filmstripInterpolatedWidthPx({
                index: 1,
                current: 1,
                neighborIndex: null,
                progress: 0.5,
                neighborWidth,
                currentWidth,
                incomingWidth,
            }),
        ).toBe(currentWidth)
    })
})

describe("filmstripGapAfterAtProgress", () => {
    it("lerps filmstripGapAfter from current toward neighborIndex", () => {
        expect(filmstripGapAfterAtProgress(5, 5, 6, 0, 2, 8)).toBe(8)
        expect(filmstripGapAfterAtProgress(6, 5, 6, 0, 2, 8)).toBe(2)
        expect(filmstripGapAfterAtProgress(5, 5, 6, 1, 2, 8)).toBe(filmstripGapAfter(5, 6, 2, 8))
        expect(filmstripGapAfterAtProgress(6, 5, 6, 1, 2, 8)).toBe(filmstripGapAfter(6, 6, 2, 8))
        expect(filmstripGapAfterAtProgress(6, 5, 6, 0.5, 2, 8)).toBeCloseTo((2 + 8) / 2, 5)
    })

    it("keeps currentGap on the shared edge between the pair", () => {
        expect(filmstripGapAfterAtProgress(5, 5, 6, 0.5, 2, 8)).toBe(8)
        expect(filmstripGapAfter(5, 5, 2, 8)).toBe(8)
        expect(filmstripGapAfter(5, 6, 2, 8)).toBe(8)
    })
})

describe("filmstripCentersScrollLeft", () => {
    it("is the lerped pair-center minus half viewport, clamped", () => {
        expect(
            filmstripCentersScrollLeft({
                fromCenter: 100,
                toCenter: 200,
                progress: 0.5,
                viewportWidth: 100,
                totalSize: 400,
            }),
        ).toBe(100)
        expect(
            filmstripCentersScrollLeft({
                fromCenter: 10,
                toCenter: 10,
                progress: 1,
                viewportWidth: 100,
                totalSize: 400,
            }),
        ).toBe(0)
        expect(
            filmstripCentersScrollLeft({
                fromCenter: 390,
                toCenter: 390,
                progress: 0,
                viewportWidth: 100,
                totalSize: 400,
            }),
        ).toBe(300)
    })

    it("is 0 when totalSize <= viewport", () => {
        expect(
            filmstripCentersScrollLeft({
                fromCenter: 40,
                toCenter: 80,
                progress: 0.5,
                viewportWidth: 200,
                totalSize: 50,
            }),
        ).toBe(0)
    })
})

describe("filmstripEndInsetPx", () => {
    it("is half viewport minus half item, floored at 0", () => {
        expect(filmstripEndInsetPx(40, 100)).toBe(30)
        expect(filmstripEndInsetPx(120, 100)).toBe(0)
        expect(filmstripEndInsetPx(0, 100)).toBe(50)
    })
})

describe("filmstripCentersScrollLeft pads", () => {
    it("first rest is 0 and last rest is maxLeft", () => {
        let startPad = 30
        let endPad = 30
        let viewportWidth = 100
        let totalSize = 400
        let firstCenter = startPad + 20
        expect(
            filmstripCentersScrollLeft({
                fromCenter: firstCenter,
                toCenter: firstCenter,
                progress: 1,
                viewportWidth,
                totalSize,
                startPad,
                endPad,
            }),
        ).toBe(0)
        let lastCenter = startPad + totalSize - 20
        let maxLeft = startPad + totalSize + endPad - viewportWidth
        expect(
            filmstripCentersScrollLeft({
                fromCenter: lastCenter,
                toCenter: lastCenter,
                progress: 1,
                viewportWidth,
                totalSize,
                startPad,
                endPad,
            }),
        ).toBe(maxLeft)
        expect(maxLeft).toBe(360)
    })

    it("mid content center 200 with pads 30 lands at 180", () => {
        expect(
            filmstripCentersScrollLeft({
                fromCenter: 30 + 200,
                toCenter: 30 + 200,
                progress: 1,
                viewportWidth: 100,
                totalSize: 400,
                startPad: 30,
                endPad: 30,
            }),
        ).toBe(180)
    })

    it("live lerp from first moves scrollLeft above 0", () => {
        let left = filmstripCentersScrollLeft({
            fromCenter: 50,
            toCenter: 90,
            progress: 0.5,
            viewportWidth: 100,
            totalSize: 400,
            startPad: 30,
            endPad: 30,
        })
        expect(left).toBe(20)
        expect(left).toBeGreaterThan(0)
    })
})

describe("filmstripEdgeFade", () => {
    it("is both false when the strip does not overflow", () => {
        expect(filmstripEdgeFade({ scrollLeft: 10, maxLeft: 100, overflows: false })).toEqual({
            start: false,
            end: false,
        })
    })

    it("turns start off at 0 and end off at maxLeft", () => {
        expect(filmstripEdgeFade({ scrollLeft: 0, maxLeft: 360, overflows: true })).toEqual({
            start: false,
            end: true,
        })
        expect(filmstripEdgeFade({ scrollLeft: 360, maxLeft: 360, overflows: true })).toEqual({
            start: true,
            end: false,
        })
        expect(filmstripEdgeFade({ scrollLeft: 180, maxLeft: 360, overflows: true })).toEqual({
            start: true,
            end: true,
        })
    })

    it("treats within EPS of an end as that end", () => {
        expect(FILMSTRIP_EDGE_FADE_EPS_PX).toBe(0.5)
        expect(filmstripEdgeFade({ scrollLeft: 0.5, maxLeft: 360, overflows: true })).toEqual({
            start: false,
            end: true,
        })
        expect(filmstripEdgeFade({ scrollLeft: 0.51, maxLeft: 360, overflows: true })).toEqual({
            start: true,
            end: true,
        })
        expect(filmstripEdgeFade({ scrollLeft: 359.5, maxLeft: 360, overflows: true })).toEqual({
            start: true,
            end: false,
        })
    })
})
