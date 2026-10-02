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

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t
}

export const FILMSTRIP_SWIPE_SLIDE_GAP_PX: number = 40
export const FILMSTRIP_SWIPE_SLIDE_GAP_DESKTOP_PX: number = 80
export const FILMSTRIP_SWIPE_SLIDE_GAP_MOBILE_MAX_PX: number = 640

export function filmstripSwipeSlideGapPx(viewportWidth: number): number {
    let w = viewportWidth > 0 ? viewportWidth : 800
    if (w <= FILMSTRIP_SWIPE_SLIDE_GAP_MOBILE_MAX_PX) return FILMSTRIP_SWIPE_SLIDE_GAP_PX
    return FILMSTRIP_SWIPE_SLIDE_GAP_DESKTOP_PX
}

export function filmstripSwipeProgress(offsetX: number, viewportWidth: number): number {
    let w = viewportWidth > 0 ? viewportWidth : 800
    let step = Math.max(1, w + filmstripSwipeSlideGapPx(w))
    let t = Math.abs(offsetX) / step
    if (t <= 0) return 0
    if (t >= 1) return 1
    return t
}

export function filmstripSwipeNeighborIndex(index: number, offsetX: number, count: number): number | null {
    if (offsetX === 0 || count < 2) return null
    if (offsetX < 0) {
        let next = index + 1
        return next < count ? next : null
    }
    let prev = index - 1
    return prev >= 0 ? prev : null
}

export function filmstripInterpolatedWidthPx(opts: {
    index: number
    current: number
    neighborIndex: number | null
    progress: number
    neighborWidth: number
    currentWidth: number
    incomingWidth: number
}): number {
    if (opts.neighborIndex == null || opts.progress <= 0) {
        return opts.index === opts.current ? opts.currentWidth : opts.neighborWidth
    }
    let from = opts.index === opts.current ? opts.currentWidth : opts.neighborWidth
    let to = opts.index === opts.neighborIndex ? opts.incomingWidth : opts.neighborWidth
    return lerp(from, to, opts.progress)
}

export function filmstripGapAfterAtProgress(
    index: number,
    current: number,
    neighborIndex: number | null,
    progress: number,
    gap: number,
    currentGap: number,
): number {
    if (neighborIndex == null || progress <= 0) {
        return filmstripGapAfter(index, current, gap, currentGap)
    }
    return lerp(
        filmstripGapAfter(index, current, gap, currentGap),
        filmstripGapAfter(index, neighborIndex, gap, currentGap),
        progress,
    )
}

export function filmstripCentersScrollLeft(opts: {
    fromCenter: number
    toCenter: number
    progress: number
    viewportWidth: number
    totalSize: number
}): number {
    let center = lerp(opts.fromCenter, opts.toCenter, opts.progress)
    let left = center - opts.viewportWidth / 2
    let maxLeft = Math.max(0, opts.totalSize - opts.viewportWidth)
    if (left < 0) return 0
    if (left > maxLeft) return maxLeft
    return left
}
