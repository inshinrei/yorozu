import { describe, expect, it } from "vitest"
import {
    AlbumRectPart,
    albumRatiosFromSizes,
    calculateAlbumLayoutByRatios,
    DEFAULT_ALBUM_MAX_WIDTH,
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

    it("n=1 is full width", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1.5], { maxWidth: 450, maxHeight: 450 })
        expect(layout).toHaveLength(1)
        expect(layout[0]!.dimensions.width).toBe(450)
        expect(containerStyle.width).toBe(450)
    })

    it("defaults max width to 450", () => {
        expect(DEFAULT_ALBUM_MAX_WIDTH).toBe(450)
        expect(DEFAULT_ALBUM_SPACING).toBe(2)
        expect(AlbumRectPart).toEqual({ None: 0, Top: 1, Right: 2, Bottom: 4, Left: 8 })
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1])
        expect(layout[0]!.dimensions.width).toBe(DEFAULT_ALBUM_MAX_WIDTH)
        expect(containerStyle.width).toBe(450)
        expect(layout[0]!.dimensions.height).toBe(450)
    })

    it("lays out two equal squares side by side", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1, 1], {
            maxWidth: 450,
            maxHeight: 450,
            spacing: DEFAULT_ALBUM_SPACING,
        })
        expect(layout).toHaveLength(2)
        expect(layout[0]!.dimensions.y).toBe(0)
        expect(layout[1]!.dimensions.y).toBe(0)
        expect(layout[1]!.dimensions.x).toBeGreaterThan(0)
        expect(layout[0]!.dimensions.x + layout[0]!.dimensions.width + DEFAULT_ALBUM_SPACING).toBe(
            layout[1]!.dimensions.x,
        )
        expect(containerStyle.width).toBe(450)
        expect(containerStyle.height).toBeGreaterThan(0)
    })

    it("lays out two similar wide landscapes stacked", () => {
        let { layout, containerStyle } = calculateAlbumLayoutByRatios([1.5, 1.5], {
            maxWidth: 450,
            maxHeight: 450,
            spacing: DEFAULT_ALBUM_SPACING,
        })
        expect(layout).toHaveLength(2)
        expect(layout[0]!.dimensions.x).toBe(0)
        expect(layout[1]!.dimensions.x).toBe(0)
        expect(layout[1]!.dimensions.y).toBeGreaterThan(0)
        expect(containerStyle.width).toBe(450)
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

    it("lays out five-plus with multi-row packer", () => {
        let ratios = [1, 1.2, 0.9, 1.1, 1.3]
        let { layout, containerStyle } = calculateAlbumLayoutByRatios(ratios, {
            maxWidth: 450,
            maxHeight: 450,
        })
        expect(layout).toHaveLength(5)
        expect(containerStyle.width).toBe(450)
        expect(layout.some((c) => c.sides & AlbumRectPart.Bottom)).toBe(true)
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

    it("locks golden geometry for n=2/3/4/5", () => {
        expect(calculateAlbumLayoutByRatios([1, 1], GOLDEN_OPTS)).toEqual({
            containerStyle: { width: 450, height: 224 },
            layout: [
                { dimensions: { x: 0, y: 0, width: 224, height: 224 }, sides: 13 },
                { dimensions: { x: 226, y: 0, width: 224, height: 224 }, sides: 7 },
            ],
        })
        expect(calculateAlbumLayoutByRatios([1.5, 1.5], GOLDEN_OPTS)).toEqual({
            containerStyle: { width: 450, height: 602 },
            layout: [
                { dimensions: { x: 0, y: 0, width: 450, height: 300 }, sides: 11 },
                { dimensions: { x: 0, y: 302, width: 450, height: 300 }, sides: 14 },
            ],
        })
        expect(calculateAlbumLayoutByRatios([1.2, 1, 1], GOLDEN_OPTS)).toEqual({
            containerStyle: { width: 450, height: 601 },
            layout: [
                { dimensions: { x: 0, y: 0, width: 450, height: 375 }, sides: 11 },
                { dimensions: { x: 0, y: 377, width: 224, height: 224 }, sides: 12 },
                { dimensions: { x: 226, y: 377, width: 224, height: 224 }, sides: 6 },
            ],
        })
        expect(calculateAlbumLayoutByRatios([2, 1, 1, 1], GOLDEN_OPTS)).toEqual({
            containerStyle: { width: 450, height: 376 },
            layout: [
                { dimensions: { x: 0, y: 0, width: 450, height: 225 }, sides: 11 },
                { dimensions: { x: 0, y: 227, width: 149, height: 149 }, sides: 12 },
                { dimensions: { x: 151, y: 227, width: 149, height: 149 }, sides: 4 },
                { dimensions: { x: 302, y: 227, width: 148, height: 149 }, sides: 6 },
            ],
        })
        expect(calculateAlbumLayoutByRatios([1, 1.2, 0.9, 1.1, 1.3], GOLDEN_OPTS)).toEqual({
            containerStyle: { width: 450, height: 337 },
            layout: [
                { dimensions: { x: 0, y: 0, width: 204, height: 204 }, sides: 9 },
                { dimensions: { x: 206, y: 0, width: 244, height: 204 }, sides: 3 },
                { dimensions: { x: 0, y: 206, width: 131, height: 131 }, sides: 12 },
                { dimensions: { x: 133, y: 206, width: 144, height: 131 }, sides: 4 },
                { dimensions: { x: 279, y: 206, width: 171, height: 131 }, sides: 6 },
            ],
        })
    })
})
