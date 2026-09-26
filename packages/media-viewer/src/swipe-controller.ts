/**
 * Pointer + wheel swipe controller for unzoomed media navigation.
 * Hosts createOffsetDrag; album commit policy stays in this module.
 */
import { createOffsetDrag, type OffsetDrag, type OffsetDragRelease } from "@yorozu/animations"
import {
    MEDIA_SWIPE_EDGE_RESIST,
    clampSwipeOffsetX,
    clampSwipeOffsetY,
    commitSwipe,
    projectSwipeOffset,
    rebasedOffsetAfterNav,
    swipeSettleDurationMs,
    verticalDismissOpacity,
    type MediaSwipeAxis,
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
    onSettle?: () => void
    onGestureChange?: (gesturing: boolean) => void
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

const CHROME_SKIP = "button, a, input, textarea, select, video"

export function createMediaSwipe(cbs: MediaSwipeCallbacks): MediaSwipe {
    let dismissing = false
    let navHopping = false
    let navRaf: number | null = null
    let prevGesturing = false
    let prevSettling = false
    let pendingGestureOff = false
    let lastChangeFiredSettle = false
    let drag: OffsetDrag

    function viewportSize(): { w: number; h: number } {
        if (cbs.getViewport) {
            let v = cbs.getViewport()
            return { w: v.width, h: v.height }
        }
        if (typeof window === "undefined") return { w: 800, h: 800 }
        return { w: window.innerWidth, h: window.innerHeight }
    }

    const mapOffset = (raw: { x: number; y: number; axis: MediaSwipeAxis }): { x: number; y: number } => {
        let projected = projectSwipeOffset(raw.axis, raw.x, raw.y)
        let { w, h } = viewportSize()
        if (raw.axis === "horizontal") {
            if (projected.x < 0 && !cbs.getCanNewer()) projected.x *= MEDIA_SWIPE_EDGE_RESIST
            if (projected.x > 0 && !cbs.getCanOlder()) projected.x *= MEDIA_SWIPE_EDGE_RESIST
            projected.x = clampSwipeOffsetX(projected.x, w)
        }
        if (raw.axis === "vertical") {
            projected.y = clampSwipeOffsetY(projected.y, h)
        }
        return projected
    }

    function reduced(): boolean {
        return cbs.getPrefersReducedMotion()
    }

    function cancelNavRaf(): void {
        if (navRaf == null) return
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(navRaf)
        navRaf = null
    }

    function flushGestureOff(): void {
        if (!pendingGestureOff) return
        pendingGestureOff = false
        cbs.onGestureChange?.(false)
    }

    function onDragChange(): void {
        lastChangeFiredSettle = false
        let g = drag.gesturing()
        let s = drag.settling()
        if (g !== prevGesturing) {
            prevGesturing = g
            if (g) {
                pendingGestureOff = false
                cbs.onGestureChange?.(true)
            } else {
                // finishFrom notifies before onRelease; wait until dismissing/navHopping/settling are set
                pendingGestureOff = true
            }
        }
        if (prevSettling && !s) {
            navHopping = false
            prevSettling = s
            if (g) return
            lastChangeFiredSettle = true
            cbs.onSettle?.()
            return
        }
        prevSettling = s
    }

    function hopToRest(navMs: number): void {
        cancelNavRaf()
        let run = (): void => {
            navRaf = null
            drag.settleTo(0, 0, navMs)
            if (drag.settling()) return
            navHopping = false
            cbs.onSettle?.()
        }
        if (typeof requestAnimationFrame === "function") {
            navRaf = requestAnimationFrame(run)
            return
        }
        run()
    }

    function bounceToRest(from: OffsetDragRelease["from"]): void {
        if (from === "wheel") drag.consumeWheelSession()
        let bounceMs = swipeSettleDurationMs("bounce", reduced())
        drag.settleTo(0, 0, bounceMs)
        if (!drag.settling()) cbs.onSettle?.()
        flushGestureOff()
    }

    function commitNav(dir: "older" | "newer", offsetX: number): void {
        navHopping = true
        drag.consumeWheelSession()
        let { w } = viewportSize()
        let rebase = cbs.willRebaseNav?.(dir) !== false
        let nextX = rebase ? rebasedOffsetAfterNav(offsetX, dir, w) : offsetX
        drag.setOffset(nextX, 0)
        drag.settleTo(nextX, 0, 0)
        if (dir === "older") cbs.onOlder()
        else cbs.onNewer()
        hopToRest(swipeSettleDurationMs("nav", reduced()))
        flushGestureOff()
    }

    function commitClose(): void {
        dismissing = true
        cancelNavRaf()
        navHopping = false
        // reset() clears wheel consume; re-arm leftover gate after
        drag.reset()
        drag.consumeWheelSession()
        cbs.onClose()
        flushGestureOff()
    }

    function onRelease(snap: OffsetDragRelease): void {
        if (dismissing) {
            drag.reset()
            flushGestureOff()
            return
        }
        if (snap.from === "cancel") {
            bounceToRest("cancel")
            return
        }
        let result = commitSwipe({
            axis: snap.axis,
            offsetX: snap.offsetX,
            offsetY: snap.offsetY,
            canOlder: cbs.getCanOlder(),
            canNewer: cbs.getCanNewer(),
            lastDeltaX: snap.lastDeltaX,
        })
        if (result === "older" || result === "newer") {
            commitNav(result, snap.offsetX)
            return
        }
        if (result === "close") {
            commitClose()
            return
        }
        if (result === "bounce") {
            bounceToRest(snap.from)
            return
        }
        drag.reset()
        flushGestureOff()
    }

    drag = createOffsetDrag({
        getEnabled: () => cbs.getEnabled(),
        prefersReducedMotion: () => reduced(),
        mapOffset,
        onChange: onDragChange,
        onRelease,
    })

    function onPointerDown(e: PointerEvent): boolean {
        if (dismissing) return false
        let t = e.target
        if (t instanceof Element && t.closest(CHROME_SKIP)) return false
        if (!drag.onPointerDown(e)) return false
        cancelNavRaf()
        navHopping = false
        return true
    }

    function resetSwipe(): void {
        cancelNavRaf()
        navHopping = false
        let wasBusy = drag.gesturing() || drag.settling() || dismissing || drag.offsetX() !== 0 || drag.offsetY() !== 0
        dismissing = false
        lastChangeFiredSettle = false
        drag.reset()
        flushGestureOff()
        if (wasBusy && !lastChangeFiredSettle) cbs.onSettle?.()
    }

    function destroy(): void {
        cancelNavRaf()
        navHopping = false
        let wasBusy = drag.gesturing() || drag.settling() || dismissing || drag.offsetX() !== 0 || drag.offsetY() !== 0
        dismissing = false
        lastChangeFiredSettle = false
        drag.destroy()
        flushGestureOff()
        if (wasBusy && !lastChangeFiredSettle) cbs.onSettle?.()
    }

    function transformStyle(): string | undefined {
        let x = drag.offsetX()
        let y = drag.offsetY()
        if (x === 0 && y === 0 && !navHopping && !dismissing) return undefined
        return `translate3d(${x}px, ${y}px, 0)`
    }

    function dismissOpacity(): number {
        let y = drag.offsetY()
        if (y < 0) return 1
        if (y === 0 && !dismissing) return 1
        if (drag.axis() !== "vertical" && !dismissing) return 1
        if (drag.axis() !== "vertical" && dismissing && y === 0) return 1
        let { h } = viewportSize()
        return verticalDismissOpacity(y, h)
    }

    return {
        offsetX: (): number => drag.offsetX(),
        offsetY: (): number => drag.offsetY(),
        axis: (): MediaSwipeAxis => drag.axis(),
        gesturing: (): boolean => drag.gesturing(),
        settling: (): boolean => drag.settling() || navHopping,
        dismissing: (): boolean => dismissing,
        transformStyle,
        dismissOpacity,
        onPointerDown,
        onPointerMove: (e: PointerEvent): void => {
            drag.onPointerMove(e)
        },
        onPointerUp: (e: PointerEvent): void => {
            drag.onPointerUp(e)
        },
        onPointerCancel: (e: PointerEvent): void => {
            drag.onPointerCancel(e)
        },
        onWheel: (e: WheelEvent): boolean => drag.onWheel(e),
        trapWheel: (e: WheelEvent): boolean => drag.trapWheel(e),
        reset: resetSwipe,
        destroy,
    }
}
