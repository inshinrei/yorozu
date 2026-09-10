/**
 * Multi-media album grid layout (ratios → absolute cells).
 * Pure geometry — no DOM. Callers pass width/height ratios of image|video items.
 * n=1 capped width; 2≤n≤10 single row; n>10 rows of 10 with remainder last.
 */

/** Bit flags: which outer sides of the album container a cell touches. */
export const AlbumRectPart: { None: 0; Top: 1; Right: 2; Bottom: 4; Left: 8 } = {
    None: 0,
    Top: 1,
    Right: 2,
    Bottom: 4,
    Left: 8,
}

export type AlbumRectPartValue = (typeof AlbumRectPart)[keyof typeof AlbumRectPart]

export type AlbumMediaDimensions = {
    width: number
    height: number
    x: number
    y: number
}

export type AlbumCell = {
    dimensions: AlbumMediaDimensions
    sides: number
}

export type AlbumLayout = {
    layout: AlbumCell[]
    containerStyle: { width: number; height: number }
}

export type CalculateAlbumLayoutOpts = {
    maxWidth?: number
    maxHeight?: number
    minWidth?: number
    spacing?: number
}

/** Default album spacing in px. */
export const DEFAULT_ALBUM_SPACING: number = 2

/** Default album max width in px. */
export const DEFAULT_ALBUM_MAX_WIDTH: number = 450

/** Cap for a lone album item so it is not full-bleed. */
export const DEFAULT_ALBUM_SINGLE_MAX_WIDTH: number = 160

/** Max thumbs per row (and last-row cap) for multi-item albums. */
export const MAX_ALBUM_ROW_ITEMS: number = 10

type LayoutParams = {
    ratios: number[]
    averageRatio: number
    maxWidth: number
    minWidth: number
    maxHeight: number
    spacing: number
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function accumulate(list: number[], initValue: number): number {
    return list.reduce((acc, item) => acc + item, initValue)
}

function getAverageRatio(ratios: number[]): number {
    return ratios.reduce((result, ratio) => ratio + result, 1) / ratios.length
}

/**
 * Row partition: single row for n≤10; fill rows of 10 with remainder last for n>10.
 */
function buildAlbumLineCounts(count: number): number[] {
    if (count <= MAX_ALBUM_ROW_ITEMS) {
        return [count]
    }
    let lineCounts: number[] = []
    let remaining = count
    while (remaining > 0) {
        let rowItems = Math.min(MAX_ALBUM_ROW_ITEMS, remaining)
        lineCounts.push(rowItems)
        remaining -= rowItems
    }
    return lineCounts
}

function cropRatios(ratios: number[], averageRatio: number): number[] {
    return ratios.map((ratio) => {
        return averageRatio > 1.1 ? clamp(ratio, 1, 2.75) : clamp(ratio, 0.6667, 1)
    })
}

function cellSides(row: number, col: number, rowCount: number, colCount: number): number {
    return (
        AlbumRectPart.None |
        (row === 0 ? AlbumRectPart.Top : AlbumRectPart.None) |
        (row === rowCount - 1 ? AlbumRectPart.Bottom : AlbumRectPart.None) |
        (col === 0 ? AlbumRectPart.Left : AlbumRectPart.None) |
        (col === colCount - 1 ? AlbumRectPart.Right : AlbumRectPart.None)
    )
}

function calculateContainerSize(layout: AlbumCell[]): { width: number; height: number } {
    let styles = { width: 0, height: 0 }
    for (let { dimensions, sides } of layout) {
        if (sides & AlbumRectPart.Right) {
            styles.width = dimensions.width + dimensions.x
        }
        if (sides & AlbumRectPart.Bottom) {
            styles.height = dimensions.height + dimensions.y
        }
    }
    return styles
}

/**
 * Compute absolute album cells from width/height ratios (width ÷ height).
 * Empty ratios → empty layout. n=1 capped; 2≤n≤10 one row; n>10 rows of 10.
 */
export function calculateAlbumLayoutByRatios(ratios: number[], opts?: CalculateAlbumLayoutOpts): AlbumLayout {
    if (!ratios.length) {
        return {
            layout: [],
            containerStyle: { width: 0, height: 0 },
        }
    }

    let spacing = opts?.spacing ?? DEFAULT_ALBUM_SPACING
    let maxWidth = opts?.maxWidth ?? DEFAULT_ALBUM_MAX_WIDTH
    let maxHeight = opts?.maxHeight ?? maxWidth
    let minWidth = opts?.minWidth ?? 100

    let params: LayoutParams = {
        ratios,
        averageRatio: getAverageRatio(ratios),
        maxWidth,
        minWidth,
        maxHeight,
        spacing,
    }

    let layout = ratios.length === 1 ? layoutSingle(params) : layoutWithComplexLayouter(params)

    return {
        layout,
        containerStyle: calculateContainerSize(layout),
    }
}

/**
 * Build ratios from origin pixel sizes; missing/invalid → 1 (square).
 */
export function albumRatiosFromSizes(
    items: ReadonlyArray<{ width?: number | null; height?: number | null }>,
): number[] {
    return items.map((item) => {
        let w = item.width ?? 0
        let h = item.height ?? 0
        if (!(w > 0) || !(h > 0)) return 1
        return w / h
    })
}

function layoutSingle({ ratios, maxWidth, maxHeight }: LayoutParams): AlbumCell[] {
    let width = Math.min(maxWidth, DEFAULT_ALBUM_SINGLE_MAX_WIDTH)
    let height = Math.round(Math.min(width / ratios[0]!, maxHeight))
    return [
        {
            dimensions: {
                x: 0,
                y: 0,
                width,
                height,
            },
            sides: AlbumRectPart.Left | AlbumRectPart.Top | AlbumRectPart.Right | AlbumRectPart.Bottom,
        },
    ]
}

function layoutWithComplexLayouter({
    ratios: originalRatios,
    averageRatio,
    maxWidth,
    spacing,
}: LayoutParams): AlbumCell[] {
    let ratios = cropRatios(originalRatios, averageRatio)
    let count = originalRatios.length
    let result = new Array<AlbumCell>(count)
    let lineCounts = buildAlbumLineCounts(count)

    let multiHeight = (offset: number, attemptCount: number): number => {
        let attemptRatios = ratios.slice(offset, offset + attemptCount)
        let sum = accumulate(attemptRatios, 0)
        return (maxWidth - (attemptCount - 1) * spacing) / sum
    }

    let heights: number[] = []
    let offset = 0
    for (let currentCount of lineCounts) {
        heights.push(multiHeight(offset, currentCount))
        offset += currentCount
    }

    let rowCount = lineCounts.length
    let index = 0
    let y = 0
    for (let row = 0; row !== rowCount; ++row) {
        let colCount = lineCounts[row]!
        let lineHeight = heights[row]!
        let height = Math.round(lineHeight)
        let x = 0

        for (let col = 0; col !== colCount; ++col) {
            let sides = cellSides(row, col, rowCount, colCount)
            let ratio = ratios[index]!
            let width = col === colCount - 1 ? maxWidth - x : Math.round(ratio * lineHeight)
            result[index] = {
                dimensions: {
                    x,
                    y,
                    width,
                    height,
                },
                sides,
            }
            x += width + spacing
            ++index
        }
        y += height + spacing
    }

    return result
}
