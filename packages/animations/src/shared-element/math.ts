import { centerFitInViewport, fitContain } from "../rect/fit"
import type { Insets, ObjectFit, Rect, Size } from "../rect/types"

export type Flight = {
    to: Rect
    fromTranslateX: number
    fromTranslateY: number
    fromScaleX: number
    fromScaleY: number
}

/** Expand a cover-cropped thumb so its aspect matches destination aspect. */
export function uncoverByAspect(aspectWidth: number, aspectHeight: number, thumb: Rect): Rect {
    let { top, left, width, height } = thumb
    let realW = aspectWidth
    let realH = aspectHeight
    if (!(realW > 0) || !(realH > 0) || !(width > 0) || !(height > 0)) return { ...thumb }

    if (realW === realH) {
        let size = Math.max(width, height)
        left -= (size - width) / 2
        top -= (size - height) / 2
        width = size
        height = size
    } else if (realW > realH) {
        let srcWidth = width
        width = height * (realW / realH)
        left -= (width - srcWidth) / 2
    } else {
        let srcHeight = height
        height = width * (realH / realW)
        top -= (height - srcHeight) / 2
    }
    return { top, left, width, height }
}

/** Center-based translate/scale so an element at `to` visually matches `from`. */
export function computeFlight(from: Rect, to: Rect): Flight | null {
    if (!(to.width > 0) || !(to.height > 0) || !(from.width > 0) || !(from.height > 0)) return null
    let fromCx = from.left + from.width / 2
    let fromCy = from.top + from.height / 2
    let toCx = to.left + to.width / 2
    let toCy = to.top + to.height / 2
    return {
        to: { ...to },
        fromTranslateX: fromCx - toCx,
        fromTranslateY: fromCy - toCy,
        fromScaleX: from.width / to.width,
        fromScaleY: from.height / to.height,
    }
}

/** Prefer natural size; fall back to thumb so fit is never empty. */
export function resolveNaturalSize(
    naturalWidth: number | undefined,
    naturalHeight: number | undefined,
    thumb: Rect,
): Size {
    if (naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0) {
        return { width: naturalWidth, height: naturalHeight }
    }
    if (thumb.width > 0 && thumb.height > 0) {
        return { width: thumb.width, height: thumb.height }
    }
    return { width: 1, height: 1 }
}

export type OpenFlightOpts = {
    thumb: Rect
    naturalWidth?: number
    naturalHeight?: number
    objectFit: ObjectFit
    viewport: Size
    insets?: Insets
    /** Prefer live destination rect when already laid out. */
    to?: Rect | null
}

/**
 * Open flight: (possibly uncovered) thumb → stage fit box (or explicit live `to`).
 * Cover thumbs uncover against destination aspect so scale is uniform.
 */
export function computeOpenFlight(opts: OpenFlightOpts): Flight | null {
    let natural = resolveNaturalSize(opts.naturalWidth, opts.naturalHeight, opts.thumb)
    let to: Rect | null = opts.to && opts.to.width > 0 && opts.to.height > 0 ? { ...opts.to } : null
    if (!to) {
        if (!opts.insets) return null
        let avail: Size = {
            width: Math.max(0, opts.viewport.width - opts.insets.left - opts.insets.right),
            height: Math.max(0, opts.viewport.height - opts.insets.top - opts.insets.bottom),
        }
        let fit = fitContain(natural, avail)
        if (!fit) return null
        to = centerFitInViewport(fit, opts.viewport, opts.insets)
    }

    let from: Rect
    if (opts.objectFit === "cover") {
        from = uncoverByAspect(to.width, to.height, opts.thumb)
    } else {
        from = { ...opts.thumb }
    }
    return computeFlight(from, to)
}

export type CloseFlightOpts = {
    fromStage: Rect
    thumb: Rect
    objectFit: ObjectFit
}

/**
 * Close flight: stage box → thumb.
 * Cover uses Math.min(sx, sy) so the land crop matches.
 */
export function computeCloseFlight(opts: CloseFlightOpts): Flight | null {
    let flight = computeFlight(opts.fromStage, opts.thumb)
    if (!flight) return null
    if (opts.objectFit === "cover") {
        let s = Math.min(flight.fromScaleX, flight.fromScaleY)
        flight = { ...flight, fromScaleX: s, fromScaleY: s }
    }
    return flight
}

/** Whether rect is fully inside clip (within epsilon). */
export function isRectFullyVisibleIn(rect: Rect, clip: Rect, epsilon = 1): boolean {
    if (!(rect.width > 0) || !(rect.height > 0) || !(clip.width > 0) || !(clip.height > 0)) return false
    let right = rect.left + rect.width
    let bottom = rect.top + rect.height
    let clipRight = clip.left + clip.width
    let clipBottom = clip.top + clip.height
    return (
        rect.left >= clip.left - epsilon &&
        rect.top >= clip.top - epsilon &&
        right <= clipRight + epsilon &&
        bottom <= clipBottom + epsilon
    )
}

/** Whether rect intersects the viewport enough to land on. */
export function isRectInViewport(rect: Rect, viewport: Size, minVisiblePx = 8): boolean {
    let right = rect.left + rect.width
    let bottom = rect.top + rect.height
    let visW = Math.min(right, viewport.width) - Math.max(rect.left, 0)
    let visH = Math.min(bottom, viewport.height) - Math.max(rect.top, 0)
    return visW >= minVisiblePx && visH >= minVisiblePx
}

/** Off-viewport landing: fly above or below toward the thumb's side. */
export function offViewportLandingRect(from: Rect, thumb: Rect, viewportHeight: number): Rect {
    let above = thumb.top + thumb.height / 2 < from.top + from.height / 2
    return {
        top: above ? -thumb.height : viewportHeight,
        left: thumb.left,
        width: thumb.width,
        height: thumb.height,
    }
}
