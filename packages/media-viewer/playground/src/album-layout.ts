/**
 * Multi-media album grid layout (ratios → absolute cells).
 * Pure geometry — no DOM. Callers pass width/height ratios of image|video items.
 * n=1 full-width; n≥2 one multi-row packer (attempt/score).
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

const MAX_COMPLEX_LAYOUT_ROW_ITEMS = 3
const MAX_COMPLEX_LAYOUT_LAST_ROW_ITEMS = 4
const EXTENDED_LAYOUT_EXTRA_ROW_COUNT = 2
const MIN_EXTENDED_LAYOUT_ROW_COUNT = 5

/** Default album spacing in px. */
export const DEFAULT_ALBUM_SPACING: number = 2

/** Default album max width in px. */
export const DEFAULT_ALBUM_MAX_WIDTH: number = 450

type Attempt = {
    lineCounts: number[]
    heights: number[]
}

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
 * Candidate row partitions for the packer.
 * Single-row maxCounts [LAST] is required for n=2–4 so side-by-side layouts
 * remain reachable (multi-row-only templates yield only stacked [[1,1]] for n=2).
 */
function buildBaseLineCounts(count: number, averageRatio: number): number[][] {
    return [
        [MAX_COMPLEX_LAYOUT_LAST_ROW_ITEMS],
        [MAX_COMPLEX_LAYOUT_ROW_ITEMS, MAX_COMPLEX_LAYOUT_ROW_ITEMS],
        [
            MAX_COMPLEX_LAYOUT_ROW_ITEMS,
            averageRatio < 0.85 ? MAX_COMPLEX_LAYOUT_LAST_ROW_ITEMS : MAX_COMPLEX_LAYOUT_ROW_ITEMS,
            MAX_COMPLEX_LAYOUT_ROW_ITEMS,
        ],
        [
            MAX_COMPLEX_LAYOUT_ROW_ITEMS,
            MAX_COMPLEX_LAYOUT_ROW_ITEMS,
            MAX_COMPLEX_LAYOUT_ROW_ITEMS,
            MAX_COMPLEX_LAYOUT_LAST_ROW_ITEMS,
        ],
    ].flatMap((maxCounts) => buildLineCounts(count, maxCounts))
}

function buildExtendedLineCounts(count: number): number[][] {
    let minRowCount = Math.max(
        MIN_EXTENDED_LAYOUT_ROW_COUNT,
        Math.ceil((count - MAX_COMPLEX_LAYOUT_LAST_ROW_ITEMS) / MAX_COMPLEX_LAYOUT_ROW_ITEMS) + 1,
    )
    let maxRowCount = Math.min(count, minRowCount + EXTENDED_LAYOUT_EXTRA_ROW_COUNT)
    let lineCounts: number[][] = []

    for (let rowCount = minRowCount; rowCount <= maxRowCount; rowCount++) {
        let current = buildExtendedLineCount(count, rowCount)
        if (current) {
            lineCounts.push(current)
        }
    }

    return lineCounts
}

function buildExtendedLineCount(count: number, rowCount: number): number[] | undefined {
    let lineCounts = Array.from({ length: rowCount }, () => 1)
    let maxCounts = Array.from({ length: rowCount }, () => MAX_COMPLEX_LAYOUT_ROW_ITEMS)
    maxCounts[rowCount - 1] = MAX_COMPLEX_LAYOUT_LAST_ROW_ITEMS

    if (count > accumulate(maxCounts, 0)) {
        return undefined
    }

    let remainingCount = count - rowCount
    for (let row = rowCount - 1; row >= 0 && remainingCount; row--) {
        let addedCount = Math.min(remainingCount, maxCounts[row]! - lineCounts[row]!)
        lineCounts[row] += addedCount
        remainingCount -= addedCount
    }

    return lineCounts
}

function buildLineCounts(count: number, maxCounts: number[]): number[][] {
    let lineCounts: number[][] = []
    collectLineCounts(count, maxCounts, [], lineCounts)
    return lineCounts
}

function collectLineCounts(
    remainingCount: number,
    maxCounts: number[],
    currentLineCounts: number[],
    result: number[][],
): void {
    if (!maxCounts.length) {
        if (!remainingCount) {
            result.push([...currentLineCounts])
        }
        return
    }

    let [maxCurrentCount, ...restMaxCounts] = maxCounts
    let maxRestCount = accumulate(restMaxCounts, 0)
    let minCurrentCount = Math.max(1, remainingCount - maxRestCount)
    let maxAllowedCount = Math.min(maxCurrentCount!, remainingCount - restMaxCounts.length)

    for (let currentCount = minCurrentCount; currentCount <= maxAllowedCount; currentCount++) {
        currentLineCounts.push(currentCount)
        collectLineCounts(remainingCount - currentCount, restMaxCounts, currentLineCounts, result)
        currentLineCounts.pop()
    }
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
 * Empty ratios → empty layout. n=1 full-width; n≥2 multi-row packer.
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
    let height = Math.round(Math.min(maxWidth / ratios[0]!, maxHeight))
    return [
        {
            dimensions: {
                x: 0,
                y: 0,
                width: maxWidth,
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
    minWidth,
    spacing,
    maxHeight = (4 * maxWidth) / 3,
}: LayoutParams): AlbumCell[] {
    let ratios = cropRatios(originalRatios, averageRatio)
    let count = originalRatios.length
    let result = new Array<AlbumCell>(count)
    let attempts: Attempt[] = []

    let multiHeight = (offset: number, attemptCount: number): number => {
        let attemptRatios = ratios.slice(offset, offset + attemptCount)
        let sum = accumulate(attemptRatios, 0)
        return (maxWidth - (attemptCount - 1) * spacing) / sum
    }

    let pushAttempt = (lineCounts: number[]): void => {
        let heights: number[] = []
        let offset = 0
        for (let currentCount of lineCounts) {
            heights.push(multiHeight(offset, currentCount))
            offset += currentCount
        }
        attempts.push({ lineCounts, heights })
    }

    for (let counts of buildBaseLineCounts(count, averageRatio)) {
        pushAttempt(counts)
    }

    if (!attempts.length) {
        for (let counts of buildExtendedLineCounts(count)) {
            pushAttempt(counts)
        }
    }

    let optimalAttempt: Attempt | undefined
    let optimalDiff = 0
    for (let i = 0; i < attempts.length; i++) {
        let { heights, lineCounts } = attempts[i]!
        let lineCount = lineCounts.length
        let totalHeight = accumulate(heights, 0) + spacing * (lineCount - 1)
        let minLineHeight = Math.min(...heights)
        let bad1 = minLineHeight < minWidth ? 1.5 : 1
        let bad2 = ((): number => {
            for (let line = 1; line !== lineCount; ++line) {
                if (lineCounts[line - 1]! > lineCounts[line]!) {
                    return 1.5
                }
            }
            return 1
        })()
        let diff = Math.abs(totalHeight - maxHeight) * bad1 * bad2

        if (!optimalAttempt || diff < optimalDiff) {
            optimalAttempt = attempts[i]
            optimalDiff = diff
        }
    }

    // Fallback if no attempt (should not happen for reasonable counts)
    if (!optimalAttempt) {
        return layoutSingle({
            ratios: originalRatios,
            averageRatio: 1,
            maxWidth,
            minWidth,
            maxHeight,
            spacing,
        })
    }

    let optimalCounts = optimalAttempt.lineCounts
    let optimalHeights = optimalAttempt.heights
    let rowCount = optimalCounts.length
    let index = 0
    let y = 0
    for (let row = 0; row !== rowCount; ++row) {
        let colCount = optimalCounts[row]!
        let lineHeight = optimalHeights[row]!
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
