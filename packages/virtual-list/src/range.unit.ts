import { describe, expect, it } from "vitest"
import {
    firstVisibleIndexFromPrefix,
    heightPrefix,
    LIST_SLICE_MAX,
    LIST_SLICE_MIN,
    LIST_SLICE_OVERSCAN_ROWS,
    listSliceForViewport,
    paintedIndexRange,
    rowTopFromPrefix,
} from "./range"

describe("heightPrefix", () => {
    it("builds prefix sums with a leading 0", () => {
        expect(heightPrefix(3, (i) => (i === 1 ? 100 : 118))).toEqual([0, 118, 218, 336])
    })
})

describe("firstVisibleIndexFromPrefix", () => {
    it("returns 0 for empty or non-positive scroll", () => {
        expect(firstVisibleIndexFromPrefix([0], 10)).toBe(0)
        expect(
            firstVisibleIndexFromPrefix(
                heightPrefix(4, () => 40),
                0,
            ),
        ).toBe(0)
        expect(
            firstVisibleIndexFromPrefix(
                heightPrefix(4, () => 40),
                -8,
            ),
        ).toBe(0)
    })

    it("finds the first row whose bottom is past scrollTop", () => {
        let prefix = heightPrefix(4, (i) => [10, 50, 20, 80][i]!)
        expect(prefix).toEqual([0, 10, 60, 80, 160])
        expect(firstVisibleIndexFromPrefix(prefix, 55)).toBe(1)
        expect(firstVisibleIndexFromPrefix(prefix, 10)).toBe(1)
        expect(firstVisibleIndexFromPrefix(prefix, 9)).toBe(0)
        expect(firstVisibleIndexFromPrefix(prefix, 160)).toBe(3)
        expect(firstVisibleIndexFromPrefix(prefix, 999)).toBe(3)
    })

    it("matches O(1) floor division on uniform rows", () => {
        let h = 40
        let count = 10
        let prefix = heightPrefix(count, () => h)
        expect(firstVisibleIndexFromPrefix(prefix, 120)).toBe(3)
        expect(firstVisibleIndexFromPrefix(prefix, 120)).toBe(Math.min(count - 1, Math.floor(120 / h)))
    })
})

describe("rowTopFromPrefix", () => {
    it("returns prefix[index] clamped", () => {
        let prefix = heightPrefix(3, (i) => (i === 1 ? 100 : 118))
        expect(rowTopFromPrefix(prefix, 0)).toBe(0)
        expect(rowTopFromPrefix(prefix, 2)).toBe(218)
        expect(rowTopFromPrefix(prefix, 3)).toBe(336)
        expect(rowTopFromPrefix(prefix, 99)).toBe(336)
        expect(rowTopFromPrefix([], 0)).toBe(0)
    })
})

describe("paintedIndexRange", () => {
    it("returns empty when viewport, item height, or count is not positive", () => {
        expect(paintedIndexRange(0, 0, 48, 10)).toEqual({ start: 0, end: 0 })
        expect(paintedIndexRange(0, 240, 0, 10)).toEqual({ start: 0, end: 0 })
        expect(paintedIndexRange(0, 240, 48, 0)).toEqual({ start: 0, end: 0 })
    })

    it("covers the first screen including a partial last row", () => {
        expect(paintedIndexRange(0, 240, 48, 100)).toEqual({ start: 0, end: 5 })
        expect(paintedIndexRange(0, 250, 48, 100)).toEqual({ start: 0, end: 6 })
    })

    it("advances with scrollTop and clamps to count", () => {
        expect(paintedIndexRange(96, 240, 48, 100)).toEqual({ start: 2, end: 7 })
        expect(paintedIndexRange(0, 480, 48, 3)).toEqual({ start: 0, end: 3 })
        expect(paintedIndexRange(5000, 240, 48, 10)).toEqual({ start: 10, end: 10 })
    })
})

describe("listSliceForViewport", () => {
    it("exposes defaults", () => {
        expect(LIST_SLICE_MIN).toBe(16)
        expect(LIST_SLICE_MAX).toBe(48)
        expect(LIST_SLICE_OVERSCAN_ROWS).toBe(4)
    })

    it("returns min when geometry is not positive", () => {
        expect(listSliceForViewport(0, 48)).toBe(16)
        expect(listSliceForViewport(400, 0)).toBe(16)
    })

    it("clamps ceil(vh/item) + overscan into [min, max]", () => {
        expect(listSliceForViewport(300, 72)).toBe(16)
        expect(listSliceForViewport(800, 48)).toBe(21)
        expect(listSliceForViewport(2000, 40)).toBe(48)
        expect(listSliceForViewport(800, 48, { min: 8, max: 20, overscanRows: 2 })).toBe(19)
    })
})
