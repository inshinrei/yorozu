/**
 * Pure swipe math: axis lock + commit decision for unzoomed media navigation.
 * Horizontal → older/newer; vertical down → close, vertical up → none. Presentation-only (no DOM).
 */

import {
    DRAG_LOCK_PX,
    DRAG_LOCK_RATIO,
    MOTION_NAV_MS,
    MOTION_SETTLE_MS,
    WHEEL_COOLDOWN_MS,
    WHEEL_QUIET_PX,
    WHEEL_RELEASE_MS,
    projectDragOffset,
    resolveDragAxis,
    type DragAxis,
} from "@yorozu/animations"

export type MediaSwipeAxis = DragAxis
export type MediaSwipeCommit = "none" | "older" | "newer" | "close" | "bounce"

export const MEDIA_SWIPE_X_THRESHOLD: number = 50
export const MEDIA_SWIPE_Y_THRESHOLD: number = 50
export const MEDIA_SWIPE_DIRECTION_THRESHOLD: number = DRAG_LOCK_PX
export const MEDIA_SWIPE_DIRECTION_TOLERANCE: number = DRAG_LOCK_RATIO
export const MEDIA_SWIPE_WHEEL_RELEASE_MS: number = WHEEL_RELEASE_MS
export const MEDIA_SWIPE_WHEEL_COOLDOWN_MS: number = WHEEL_COOLDOWN_MS
export const MEDIA_SWIPE_WHEEL_QUIET_PX: number = WHEEL_QUIET_PX
export const MEDIA_SWIPE_SLIDE_GAP_PX: number = 40
export const MEDIA_SWIPE_MAX_X_VIEWPORT_RATIO: number = 1
export const MEDIA_SWIPE_SETTLE_MS: number = MOTION_NAV_MS
export const MEDIA_SWIPE_EDGE_RESIST: number = 0.28

export function horizontalSlideStepPx(viewportWidth: number): number {
    let w = viewportWidth > 0 ? viewportWidth : 800
    return w + MEDIA_SWIPE_SLIDE_GAP_PX
}

export function rebasedOffsetAfterNav(offsetX: number, dir: "older" | "newer", viewportWidth: number): number {
    let step = horizontalSlideStepPx(viewportWidth)
    return dir === "newer" ? offsetX + step : offsetX - step
}

export function swipeSettleDurationMs(kind: "bounce" | "nav", reduced: boolean): number {
    if (reduced) return 0
    return kind === "nav" ? MOTION_NAV_MS : MOTION_SETTLE_MS
}

export function resolveSwipeAxis(current: MediaSwipeAxis, offsetX: number, offsetY: number): MediaSwipeAxis {
    return resolveDragAxis(current, offsetX, offsetY)
}

export function projectSwipeOffset(axis: MediaSwipeAxis, offsetX: number, offsetY: number): { x: number; y: number } {
    return projectDragOffset(axis, offsetX, offsetY)
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
    if (offsetY < 0) return 0
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

function horizontalCommit(offsetX: number, canOlder: boolean, canNewer: boolean, xTh: number): MediaSwipeCommit {
    let absX = Math.abs(offsetX)
    if (absX < xTh) {
        return absX > 0 ? "bounce" : "none"
    }
    let towardNewer = offsetX < 0
    if (towardNewer) return canNewer ? "newer" : "bounce"
    return canOlder ? "older" : "bounce"
}

export function commitSwipe(args: CommitSwipeArgs): MediaSwipeCommit {
    let xTh = args.xThreshold ?? MEDIA_SWIPE_X_THRESHOLD
    let yTh = args.yThreshold ?? MEDIA_SWIPE_Y_THRESHOLD
    let absX = Math.abs(args.offsetX)
    let absY = Math.abs(args.offsetY)

    if (args.axis === "vertical") {
        if (args.offsetY >= yTh) return "close"
        if (args.offsetY > 0) return "bounce"
        return "none"
    }

    if (args.axis === "horizontal") {
        return horizontalCommit(args.offsetX, args.canOlder, args.canNewer, xTh)
    }

    if (args.offsetY >= yTh && absY >= absX) return "close"
    if (args.offsetY < 0 && absY >= absX) return "none"

    if (absX >= xTh && absX > absY) {
        return horizontalCommit(args.offsetX, args.canOlder, args.canNewer, xTh)
    }

    if (absX > 0 || args.offsetY > 0) return "bounce"
    return "none"
}

export function verticalDismissOpacity(offsetY: number, viewportHeight: number): number {
    let h = viewportHeight > 0 ? viewportHeight : 800
    let t = Math.min(1, Math.abs(offsetY) / (h * 0.35))
    return Math.max(0.45, 1 - t * 0.55)
}

export function mediaPagerFieldActive(offsetX: number, offsetY: number, dismissing: boolean): boolean {
    if (dismissing || offsetY > 0) return false
    return offsetX !== 0
}
