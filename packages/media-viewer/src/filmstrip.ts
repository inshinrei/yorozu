/**
 * Filmstrip thumb width, gap, pitch, and overflow helpers.
 */

export function filmstripCurrentWidthPx(opts: {
    neighborWidth: number
    height: number
    cap: number
    naturalWidth?: number
    naturalHeight?: number
}): number {
    let neighborWidth = Math.max(0, opts.neighborWidth)
    let cap = Math.max(neighborWidth, opts.cap)
    let naturalWidth = opts.naturalWidth
    let naturalHeight = opts.naturalHeight
    if (naturalWidth != null && naturalHeight != null && naturalWidth > 0 && naturalHeight > 0) {
        let aspect = opts.height * (naturalWidth / naturalHeight)
        return Math.min(cap, Math.max(neighborWidth, aspect))
    }
    return neighborWidth
}

export function filmstripGapAfter(index: number, current: number, gap: number, currentGap: number): number {
    if (index === current || index === current - 1) return currentGap
    return gap
}

export function filmstripThumbPitchPx(width: number, gapAfter: number): number {
    return width + gapAfter
}

export function filmstripOverflows(totalSize: number, viewportWidth: number): boolean {
    return totalSize > viewportWidth
}
