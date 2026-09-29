import { describe, expect, it } from "vitest"
import { filmstripCurrentWidthPx, filmstripGapAfter, filmstripOverflows, filmstripThumbPitchPx } from "./filmstrip"

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
