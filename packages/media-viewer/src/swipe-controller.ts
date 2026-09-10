/**
 * Pointer + wheel swipe controller for unzoomed media navigation.
 * Live offset while gesturing; commit on pointerup / wheel idle / early wheel.
 */
import { easeOutCubic } from "@yorozu/animations"
import {
    MEDIA_SWIPE_EDGE_RESIST,
    MEDIA_SWIPE_WHEEL_RELEASE_MS,
    clampSwipeOffsetX,
    clampSwipeOffsetY,
    commitSwipe,
    projectSwipeOffset,
    rebasedOffsetAfterNav,
    resolveSwipeAxis,
    settleDurationMs,
    shouldEarlyCommitWheel,
    verticalDismissOpacity,
    type MediaSwipeAxis,
    type MediaSwipeCommit,
} from "./swipe"

export type MediaSwipeCallbacks = {
    getEnabled: () => boolean
    getCanOlder: () => boolean
    getCanNewer: () => boolean
    getPrefersReducedMotion: () => boolean
    getViewport?: () => { width: number; height: number }
    onOlder: () => void
    onNewer: () => void
    onClose: () => void
    /** When false, a committed swipe bounces instead of rebasing (pagination edge). Default true. */
    willRebaseNav?: (dir: "older" | "newer") => boolean
}

export type MediaSwipe = {
    offsetX: () => number
    offsetY: () => number
    axis: () => MediaSwipeAxis
    gesturing: () => boolean
    settling: () => boolean
    dismissing: () => boolean
    transformStyle: () => string | undefined
    dismissOpacity: () => number
    onPointerDown: (e: PointerEvent) => boolean
    onPointerMove: (e: PointerEvent) => void
    onPointerUp: (e: PointerEvent) => void
    onPointerCancel: (e: PointerEvent) => void
    onWheel: (e: WheelEvent) => boolean
    trapWheel: (e: WheelEvent) => boolean
    reset: () => void
    destroy: () => void
}

export function createMediaSwipe(cbs: MediaSwipeCallbacks): MediaSwipe {
    let offsetX = 0
    let offsetY = 0
    let axis: MediaSwipeAxis = "none"
    let gesturing = false
    let settling = false
    let dismissing = false

    let pointerId: number | null = null
    let startClientX = 0
    let startClientY = 0
    let prevRawX = 0
    let lastDeltaX = 0
    let wheelTimer: ReturnType<typeof setTimeout> | null = null
    let settleRaf: number | null = null
    let wheelActive = false
    /** After older/newer/close, ignore further wheel until idle release. */
    let sessionConsumed = false
    /** After wheel bounce, ignore leftover wheel until idle. Does not block pointer. */
    let wheelHoldoff = false
    let settleGen = 0

    function viewportSize(): { w: number; h: number } {
        if (cbs.getViewport) {
            let v = cbs.getViewport()
            return { w: v.width, h: v.height }
        }
        if (typeof window === "undefined") return { w: 800, h: 800 }
        return { w: window.innerWidth, h: window.innerHeight }
    }

    function clearWheelTimer(): void {
        if (wheelTimer) {
            clearTimeout(wheelTimer)
            wheelTimer = null
        }
    }

    function cancelSettleRaf(): void {
        if (settleRaf != null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(settleRaf)
            settleRaf = null
        }
    }

    function clearLastDelta(): void {
        prevRawX = 0
        lastDeltaX = 0
    }

    function noteRawSample(rawX: number): void {
        lastDeltaX = rawX - prevRawX
        prevRawX = rawX
    }

    function resetOffsetsInstant(): void {
        settleGen++
        offsetX = 0
        offsetY = 0
        axis = "none"
        gesturing = false
        settling = false
        dismissing = false
        pointerId = null
        wheelActive = false
        sessionConsumed = false
        wheelHoldoff = false
        clearWheelTimer()
        cancelSettleRaf()
        clearLastDelta()
    }

    function applyProjected(rawX: number, rawY: number): void {
        let nextAxis = resolveSwipeAxis(axis, rawX, rawY)
        axis = nextAxis
        let projected = projectSwipeOffset(nextAxis, rawX, rawY)
        let { w, h } = viewportSize()

        if (nextAxis === "horizontal") {
            if (projected.x < 0 && !cbs.getCanNewer()) projected.x *= MEDIA_SWIPE_EDGE_RESIST
            if (projected.x > 0 && !cbs.getCanOlder()) projected.x *= MEDIA_SWIPE_EDGE_RESIST
            projected.x = clampSwipeOffsetX(projected.x, w)
        }
        if (nextAxis === "vertical") {
            projected.y = clampSwipeOffsetY(projected.y, h)
        }

        offsetX = projected.x
        offsetY = projected.y
    }

    function refreshWheelIdleTimer(): void {
        clearWheelTimer()
        wheelTimer = setTimeout(() => {
            wheelTimer = null
            if (sessionConsumed || wheelHoldoff) {
                sessionConsumed = false
                wheelHoldoff = false
                wheelActive = false
                return
            }
            if (!wheelActive) return
            finishGesture()
        }, MEDIA_SWIPE_WHEEL_RELEASE_MS)
    }

    function markSessionConsumed(): void {
        sessionConsumed = true
        refreshWheelIdleTimer()
    }

    function endPointerWheel(): void {
        gesturing = false
        pointerId = null
        wheelActive = false
        if (sessionConsumed || wheelHoldoff) refreshWheelIdleTimer()
        else clearWheelTimer()
    }

    function decideCommit(): MediaSwipeCommit {
        return commitSwipe({
            axis,
            offsetX,
            offsetY,
            canOlder: cbs.getCanOlder(),
            canNewer: cbs.getCanNewer(),
            lastDeltaX,
        })
    }

    function animateOffsetToZero(): void {
        cancelSettleRaf()
        let fromX = offsetX
        let fromY = offsetY
        if (fromX === 0 && fromY === 0) {
            settling = false
            return
        }
        if (cbs.getPrefersReducedMotion()) {
            offsetX = 0
            offsetY = 0
            settling = false
            return
        }

        let { w, h } = viewportSize()
        let remaining = Math.max(Math.abs(fromX), Math.abs(fromY))
        let viewport = Math.abs(fromX) >= Math.abs(fromY) ? w : h
        let duration = settleDurationMs(remaining, viewport)
        let gen = ++settleGen
        settling = true

        let start = typeof performance !== "undefined" ? performance.now() : Date.now()

        let frame = (now: number): void => {
            if (gen !== settleGen) return
            let t = Math.min(1, (now - start) / duration)
            let eased = easeOutCubic(t)
            offsetX = fromX * (1 - eased)
            offsetY = fromY * (1 - eased)
            if (t < 1) {
                settleRaf = requestAnimationFrame(frame)
                return
            }
            offsetX = 0
            offsetY = 0
            settling = false
            settleRaf = null
        }

        if (typeof requestAnimationFrame === "function") {
            settleRaf = requestAnimationFrame(frame)
        } else {
            offsetX = 0
            offsetY = 0
            settling = false
        }
    }

    function commitHorizontalNav(dir: "older" | "newer"): void {
        let { w } = viewportSize()
        let fromOffset = offsetX
        let rebase = cbs.willRebaseNav?.(dir) !== false
        let rebased = rebasedOffsetAfterNav(fromOffset, dir, w)
        endPointerWheel()
        axis = "none"
        offsetY = 0
        settling = false
        clearLastDelta()
        cancelSettleRaf()
        offsetX = rebase ? rebased : fromOffset
        markSessionConsumed()
        if (dir === "older") cbs.onOlder()
        else cbs.onNewer()

        if (cbs.getPrefersReducedMotion()) {
            offsetX = 0
            return
        }

        let gen = settleGen
        let run = (): void => {
            settleRaf = null
            if (gen !== settleGen) return
            animateOffsetToZero()
        }
        if (typeof requestAnimationFrame === "function") {
            settleRaf = requestAnimationFrame(run)
        } else {
            run()
        }
    }

    function commitCloseFromSwipe(): void {
        endPointerWheel()
        dismissing = true
        clearLastDelta()
        cancelSettleRaf()
        markSessionConsumed()
        cbs.onClose()
    }

    function runCommit(result: MediaSwipeCommit): void {
        if (result === "older") {
            commitHorizontalNav("older")
            return
        }
        if (result === "newer") {
            commitHorizontalNav("newer")
            return
        }
        if (result === "close") {
            commitCloseFromSwipe()
            return
        }
        if (result === "bounce" && (offsetX !== 0 || offsetY !== 0)) {
            let fromWheel = wheelActive
            endPointerWheel()
            axis = "none"
            clearLastDelta()
            animateOffsetToZero()
            if (fromWheel) {
                wheelHoldoff = true
                refreshWheelIdleTimer()
            }
            return
        }
        resetOffsetsInstant()
    }

    function finishGesture(): void {
        if (dismissing) return
        if (!gesturing && !wheelActive) return
        runCommit(decideCommit())
    }

    function onPointerDown(e: PointerEvent): boolean {
        if (dismissing) return false
        if (!cbs.getEnabled()) return false
        if (e.button !== 0) return false
        if (pointerId != null) return false
        let t = e.target
        if (t instanceof Element) {
            if (t.closest("button, a, input, textarea, select, video")) return false
        }
        settleGen++
        cancelSettleRaf()
        settling = false
        clearLastDelta()
        pointerId = e.pointerId
        startClientX = e.clientX
        startClientY = e.clientY
        gesturing = true
        wheelActive = false
        if (sessionConsumed || wheelHoldoff) refreshWheelIdleTimer()
        else clearWheelTimer()
        axis = "none"
        offsetX = 0
        offsetY = 0
        try {
            ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
        } catch {
            // optional
        }
        return true
    }

    function onPointerMove(e: PointerEvent): void {
        if (pointerId !== e.pointerId || !gesturing || dismissing) return
        e.preventDefault()
        let rawX = e.clientX - startClientX
        let rawY = e.clientY - startClientY
        noteRawSample(rawX)
        applyProjected(rawX, rawY)
    }

    function onPointerUp(e: PointerEvent): void {
        if (pointerId !== e.pointerId) return
        finishGesture()
    }

    function onPointerCancel(e: PointerEvent): void {
        if (pointerId !== e.pointerId) return
        runCommit("bounce")
    }

    function onWheel(e: WheelEvent): boolean {
        if (!cbs.getEnabled()) return false
        if (e.ctrlKey || e.metaKey) return false

        e.preventDefault()
        e.stopPropagation()

        if (pointerId != null) return true

        if (sessionConsumed || wheelHoldoff) {
            refreshWheelIdleTimer()
            return true
        }

        if (dismissing) return true

        let starting = !wheelActive
        settleGen++
        cancelSettleRaf()
        settling = false
        wheelActive = true
        gesturing = true

        if (starting) {
            offsetX = 0
            offsetY = 0
            axis = "none"
            clearLastDelta()
        }

        let nextX = offsetX - e.deltaX
        let nextY = offsetY - e.deltaY
        noteRawSample(nextX)
        applyProjected(nextX, nextY)

        if (shouldEarlyCommitWheel(axis, offsetX, offsetY)) {
            finishGesture()
            return true
        }

        refreshWheelIdleTimer()
        return true
    }

    function trapWheel(e: WheelEvent): boolean {
        if (!cbs.getEnabled() || e.ctrlKey || e.metaKey) return false
        e.preventDefault()
        e.stopPropagation()
        onWheel(e)
        return true
    }

    function destroy(): void {
        resetOffsetsInstant()
    }

    return {
        offsetX: () => offsetX,
        offsetY: () => offsetY,
        axis: () => axis,
        gesturing: () => gesturing,
        settling: () => settling,
        dismissing: () => dismissing,
        transformStyle: (): string | undefined => {
            if (settling || dismissing || gesturing || offsetX !== 0 || offsetY !== 0) {
                return `translate3d(${offsetX}px, ${offsetY}px, 0)`
            }
            return undefined
        },
        dismissOpacity: (): number => {
            if (axis !== "vertical" && !dismissing) return 1
            if (axis !== "vertical" && dismissing && offsetY === 0) return 1
            let { h } = viewportSize()
            return verticalDismissOpacity(offsetY, h)
        },
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onWheel,
        trapWheel,
        reset: resetOffsetsInstant,
        destroy,
    }
}
