import { describe, expect, it } from "vitest"
import {
    AlbumRectPart,
    albumRatiosFromSizes,
    calculateAlbumLayoutByRatios,
    DEFAULT_ALBUM_MAX_WIDTH,
    DEFAULT_ALBUM_SINGLE_MAX_WIDTH,
    DEFAULT_ALBUM_SPACING,
} from "./album-layout"

const GOLDEN_OPTS = { maxWidth: 450, maxHeight: 450, spacing: 2 } as const

function assertNoOverlapPositive(layout: ReturnType<typeof calculateAlbumLayoutByRatios>["layout"]): void {
    for (let cell of layout) {
        expect(cell.dimensions.width).toBeGreaterThan(0)
        expect(cell.dimensions.height).toBeGreaterThan(0)
    }
    for (let i = 0; i < layout.length; i++) {
        for (let j = i + 1; j < layout.length; j++) {
            let a = layout[i]!.dimensions
            let b = layout[j]!.dimensions
            let ax2 = a.x + a.width
            let ay2 = a.y + a.height
            let bx2 = b.x + b.width
            let by2 = b.y + b.height
            let overlapX = a.x < bx2 && b.x < ax2
            let overlapY = a.y < by2 && b.y < ay2
            expect(overlapX && overlapY).toBe(false)
        }
    }
}

describe("albumRatiosFromSizes", () => {
    it("invalid sizes become ratio 1", () => {
        expect(albumRatiosFromSizes([{ width: 200, height: 100 }, { width: 0, height: 50 }, {}])).toEqual([2, 1, 1])
    })
})

describe("calculateAlbumLayoutByRatios", () => {
    it("empty ratios → empty layout", () => {
        expect(calculateAlbumLayoutByRatios([])).toEqual({ layout: [], containerStyle: { width: 0, height: 0 } })
    })

    it("n=1 is capped, not full maxWidth", () => {
        expect(DEFAULT_ALBUM_SINGLE_MAX_WIDTH).toBe(160)
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1.5], { maxWidth: 450, maxHeight: 450 })
        expect(layout).toHaveLength(1)
        expect(layout[0]!.dimensions.width).toBe(160)
        expect(containerStyle.width).toBe(160)
    })

    it("defaults max width to 450 and single cap to 160", () => {
        expect(DEFAULT_ALBUM_MAX_WIDTH).toBe(450)
        expect(DEFAULT_ALBUM_SPACING).toBe(2)
        expect(AlbumRectPart).toEqual({ None: 0, Top: 1, Right: 2, Bottom: 4, Left: 8 })
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1])
        expect(layout[0]!.dimensions.width).toBe(DEFAULT_ALBUM_SINGLE_MAX_WIDTH)
        expect(containerStyle.width).toBe(160)
        expect(layout[0]!.dimensions.height).toBe(160)
    })

    it("lays out two equal squares side by side", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1, 1], GOLDEN_OPTS)
        expect(layout[0]!.dimensions).toEqual({ x: 0, y: 0, width: 224, height: 224 })
        expect(layout[1]!.dimensions).toEqual({ x: 226, y: 0, width: 224, height: 224 })
        expect(containerStyle).toEqual({ width: 450, height: 224 })
    })

    it("lays out two similar wide landscapes side by side", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1.5, 1.5], {
            maxWidth: 450,
            maxHeight: 450,
            spacing: DEFAULT_ALBUM_SPACING,
        })
        expect(layout).toHaveLength(2)
        expect(layout[0]!.dimensions.y).toBe(0)
        expect(layout[1]!.dimensions.y).toBe(0)
        expect(layout[1]!.dimensions.x).toBeGreaterThan(0)
        expect(containerStyle.width).toBe(450)
        assertNoOverlapPositive(layout)
    })

    it("lays out three items without overlap", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1.2, 1, 1], {
            maxWidth: 450,
            maxHeight: 450,
        })
        expect(layout).toHaveLength(3)
        expect(containerStyle.width).toBeGreaterThan(0)
        expect(containerStyle.height).toBeGreaterThan(0)
        assertNoOverlapPositive(layout)
    })

    it("lays out four items", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([2, 1, 1, 1], {
            maxWidth: 400,
            maxHeight: 400,
        })
        expect(layout).toHaveLength(4)
        expect(containerStyle.width).toBe(400)
        expect(containerStyle.height).toBeGreaterThan(0)
        assertNoOverlapPositive(layout)
    })

    it("lays out five on one row", () => {
        let ratios = [1, 1.2, 0.9, 1.1, 1.3]
        let { layout, containerStyle } = calculateAlbumLayoutByRatios(ratios, {
            maxWidth: 450,
            maxHeight: 450,
        })
        expect(layout).toHaveLength(5)
        expect(containerStyle.width).toBe(450)
        expect(new Set(layout.map((c) => c.dimensions.y))).toEqual(new Set([0]))
        assertNoOverlapPositive(layout)
    })

    it("n=2 through n=10 pack on one row", () => {
        for (let n of [2, 3, 4, 5, 6, 10]) {
            let ratios = Array.from({ length: n }, () => 1)
            let { layout, containerStyle } = calculateAlbumLayoutByRatios(ratios, GOLDEN_OPTS)
            expect(layout).toHaveLength(n)
            expect(containerStyle.width).toBe(450)
            expect(new Set(layout.map((c) => c.dimensions.y))).toEqual(new Set([0]))
            assertNoOverlapPositive(layout)
        }
    })

    it("n=11 uses a second row and at most 10 cells on the first", () => {
        let ratios = Array.from({ length: 11 }, () => 1)
        let { layout } = calculateAlbumLayoutByRatios(ratios, GOLDEN_OPTS)
        expect(layout).toHaveLength(11)
        let firstRow = layout.filter((c) => c.dimensions.y === 0)
        expect(firstRow.length).toBe(10)
        expect(layout.some((c) => c.dimensions.y > 0)).toBe(true)
        assertNoOverlapPositive(layout)
    })

    it("n=10 packs without overlap", () => {
        let ratios = Array.from({ length: 10 }, () => 1)
        let { layout, containerStyle } = calculateAlbumLayoutByRatios(ratios, { maxWidth: 450, maxHeight: 450 })
        expect(layout).toHaveLength(10)
        expect(containerStyle.width).toBe(450)
        expect(containerStyle.height).toBeGreaterThan(0)
        assertNoOverlapPositive(layout)
    })

    it("container size matches outer edges of cells", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1, 1, 1, 1], {
            maxWidth: 300,
            maxHeight: 300,
            spacing: 2,
        })
        let maxRight = 0
        let maxBottom = 0
        for (let { dimensions } of layout) {
            maxRight = Math.max(maxRight, dimensions.x + dimensions.width)
            maxBottom = Math.max(maxBottom, dimensions.y + dimensions.height)
        }
        expect(containerStyle.width).toBe(maxRight)
        expect(containerStyle.height).toBe(maxBottom)
    })
})
