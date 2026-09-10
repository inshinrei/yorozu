/**
 * Pure swipe math: axis lock + commit decision for unzoomed media navigation.
 * Horizontal → older/newer; vertical → close. Presentation-only (no DOM).
 */

export type MediaSwipeAxis = "none" | "horizontal" | "vertical"
export type MediaSwipeCommit = "none" | "older" | "newer" | "close" | "bounce"

export const MEDIA_SWIPE_X_THRESHOLD: number = 50
export const MEDIA_SWIPE_Y_THRESHOLD: number = 50
export const MEDIA_SWIPE_WHEEL_EARLY_FACTOR: number = 2
export const MEDIA_SWIPE_DIRECTION_THRESHOLD: number = 10
export const MEDIA_SWIPE_DIRECTION_TOLERANCE: number = 1.5
export const MEDIA_SWIPE_WHEEL_RELEASE_MS: number = 90
export const MEDIA_SWIPE_WHEEL_COOLDOWN_MS: number = 420
export const MEDIA_SWIPE_SLIDE_GAP_PX: number = 40
export const MEDIA_SWIPE_MAX_X_VIEWPORT_RATIO: number = 1
export const MEDIA_SWIPE_SETTLE_MS: number = 350
export const MEDIA_SWIPE_SETTLE_MS_MIN: number = 160
export const MEDIA_SWIPE_EDGE_RESIST: number = 0.28

export function horizontalSlideStepPx(viewportWidth: number): number {
    let w = viewportWidth > 0 ? viewportWidth : 800
    return w + MEDIA_SWIPE_SLIDE_GAP_PX
}

export function rebasedOffsetAfterNav(offsetX: number, dir: "older" | "newer", viewportWidth: number): number {
    let step = horizontalSlideStepPx(viewportWidth)
    return dir === "newer" ? offsetX + step : offsetX - step
}

export function settleDurationMs(remainingPx: number, viewportSize: number): number {
    let v = viewportSize > 0 ? viewportSize : 800
    let t = Math.min(1, Math.abs(remainingPx) / v)
    return Math.round(MEDIA_SWIPE_SETTLE_MS_MIN + t * (MEDIA_SWIPE_SETTLE_MS - MEDIA_SWIPE_SETTLE_MS_MIN))
}

export function resolveSwipeAxis(current: MediaSwipeAxis, offsetX: number, offsetY: number): MediaSwipeAxis {
    if (current !== "none") return current
    let absX = Math.abs(offsetX)
    let absY = Math.abs(offsetY)
    if (absX === 0 && absY === 0) return "none"

    let preferHorizontal =
        absX > MEDIA_SWIPE_DIRECTION_THRESHOLD || (absY > 0 && absX / absY > MEDIA_SWIPE_DIRECTION_TOLERANCE)
    let preferVertical =
        absY > MEDIA_SWIPE_DIRECTION_THRESHOLD || (absX > 0 && absY / absX > MEDIA_SWIPE_DIRECTION_TOLERANCE)

    if (preferHorizontal && (!preferVertical || absX >= absY)) return "horizontal"
    if (preferVertical) return "vertical"
    return "none"
}

export function projectSwipeOffset(axis: MediaSwipeAxis, offsetX: number, offsetY: number): { x: number; y: number } {
    if (axis === "horizontal") return { x: offsetX, y: 0 }
    if (axis === "vertical") return { x: 0, y: offsetY }
    return { x: 0, y: 0 }
}

export function clampSwipeOffsetX(offsetX: number, viewportWidth: number): number {
    let w = viewportWidth > 0 ? viewportWidth : 800
    let limit = w * MEDIA_SWIPE_MAX_X_VIEWPORT_RATIO + MEDIA_SWIPE_SLIDE_GAP_PX
    if (offsetX > limit) return limit
    if (offsetX < -limit) return -limit
    return offsetX
}

export function clampSwipeOffsetY(offsetY: number, viewportHeight: number): number {
    let h = viewportHeight > 0 ? viewportHeight : 800
    if (offsetY > h) return h
    if (offsetY < -h) return -h
    return offsetY
}

export function lastDeltaAgrees(offset: number, lastDelta: number): boolean {
    if (lastDelta === 0 || offset === 0) return true
    return Math.sign(offset) === Math.sign(lastDelta)
}

export type CommitSwipeArgs = {
    axis: MediaSwipeAxis
    offsetX: number
    offsetY: number
    canOlder: boolean
    canNewer: boolean
    xThreshold?: number
    yThreshold?: number
    lastDeltaX?: number
}

function horizontalCommit(
    offsetX: number,
    canOlder: boolean,
    canNewer: boolean,
    xTh: number,
    lastDeltaX: number,
): MediaSwipeCommit {
    let absX = Math.abs(offsetX)
    if (absX < xTh) {
        return absX > 0 ? "bounce" : "none"
    }
    if (!lastDeltaAgrees(offsetX, lastDeltaX)) return "bounce"
    let towardNewer = offsetX < 0
    if (towardNewer) return canNewer ? "newer" : "bounce"
    return canOlder ? "older" : "bounce"
}

export function commitSwipe(args: CommitSwipeArgs): MediaSwipeCommit {
    let xTh = args.xThreshold ?? MEDIA_SWIPE_X_THRESHOLD
    let yTh = args.yThreshold ?? MEDIA_SWIPE_Y_THRESHOLD
    let lastDeltaX = args.lastDeltaX ?? 0
    let absX = Math.abs(args.offsetX)
    let absY = Math.abs(args.offsetY)

    if (args.axis === "vertical") {
        if (absY >= yTh) return "close"
        if (absY > 0) return "bounce"
        return "none"
    }

    if (args.axis === "horizontal") {
        return horizontalCommit(args.offsetX, args.canOlder, args.canNewer, xTh, lastDeltaX)
    }

    if (absY >= yTh && absY >= absX) return "close"

    if (absX >= xTh && absX > absY) {
        return horizontalCommit(args.offsetX, args.canOlder, args.canNewer, xTh, lastDeltaX)
    }

    if (absX > 0 || absY > 0) return "bounce"
    return "none"
}

export function wheelEarlyThresholdPx(axisThreshold: number): number {
    return axisThreshold * MEDIA_SWIPE_WHEEL_EARLY_FACTOR
}

export function shouldEarlyCommitWheel(axis: MediaSwipeAxis, offsetX: number, offsetY: number): boolean {
    if (axis === "horizontal") {
        return Math.abs(offsetX) > wheelEarlyThresholdPx(MEDIA_SWIPE_X_THRESHOLD)
    }
    if (axis === "vertical") {
        return Math.abs(offsetY) > wheelEarlyThresholdPx(MEDIA_SWIPE_Y_THRESHOLD)
    }
    return false
}

export function verticalDismissOpacity(offsetY: number, viewportHeight: number): number {
    let h = viewportHeight > 0 ? viewportHeight : 800
    let t = Math.min(1, Math.abs(offsetY) / (h * 0.35))
    return Math.max(0.45, 1 - t * 0.55)
}
