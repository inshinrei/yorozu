import { MOTION_SETTLE_MS } from "../core/motion-timing"
import { easeOutCubic, tween } from "../core/tween"
import type { Playback } from "../core/types"
import { createWheelSession, WHEEL_RELEASE_MS } from "../offset-drag/wheel-session"
import { OVERSCROLL_COEFF, rubberBandOverscroll } from "./math"

export type OverscrollBounceOptions = {
    coeff?: number
    getDurationMs?: () => number
}

export type OverscrollBounce = {
    destroy: () => void
}

function maxScrollOf(el: HTMLElement): number {
    return Math.max(0, el.scrollHeight - el.clientHeight)
}

function atTop(el: HTMLElement): boolean {
    return el.scrollTop <= 0
}

function atBottom(el: HTMLElement): boolean {
    return el.scrollTop >= maxScrollOf(el) - 0.5
}

export function createOverscrollBounce(
    scroller: HTMLElement,
    content: HTMLElement,
    options?: OverscrollBounceOptions,
): OverscrollBounce {
    let raw = 0
    let pointerId: number | null = null
    let lastY = 0
    let destroyed = false
    let captured = false
    let settlePlayback: Playback | null = null
    let coeff = options?.coeff ?? OVERSCROLL_COEFF
    const getDurationMs = options?.getDurationMs ?? ((): number => MOTION_SETTLE_MS)

    const paint = (nextRaw: number): void => {
        raw = nextRaw
        let visual = rubberBandOverscroll(raw, scroller.clientHeight, coeff)
        content.style.transform = visual === 0 ? "" : `translateY(${visual}px)`
        content.dataset.yorozuOverscroll = visual > 0 ? "top" : visual < 0 ? "bottom" : "none"
    }

    const cancelSettle = (): void => {
        settlePlayback?.cancel()
        settlePlayback = null
    }

    const settle = (): void => {
        cancelSettle()
        if (raw === 0) {
            paint(0)
            return
        }
        let duration = getDurationMs()
        if (duration <= 0) {
            paint(0)
            return
        }
        let run = tween({
            from: raw,
            to: 0,
            durationMs: duration,
            easing: easeOutCubic,
            onUpdate: (value) => {
                paint(value)
            },
        })
        settlePlayback = run
        void run.done.then(() => {
            if (settlePlayback !== run) return
            paint(0)
            settlePlayback = null
        })
    }

    const wheel = createWheelSession({
        releaseMs: WHEEL_RELEASE_MS,
        onRelease: () => {
            wheel.consume()
            settle()
        },
    })

    const releaseCapture = (id: number): void => {
        if (!captured) return
        captured = false
        try {
            scroller.releasePointerCapture(id)
        } catch {
            // already released
        }
    }

    const onWheel = (event: WheelEvent): void => {
        if (destroyed || pointerId !== null) return
        if (event.ctrlKey || event.metaKey) return
        let onEdge = atTop(scroller) || atBottom(scroller)
        let wouldStart = (event.deltaY < 0 && atTop(scroller)) || (event.deltaY > 0 && atBottom(scroller))
        if (raw === 0 && !wouldStart && !onEdge) return
        if (raw === 0 && !wouldStart && onEdge) return
        let kind = wheel.note(event.deltaX, event.deltaY, {
            momentum: (event as WheelEvent & { momentum?: boolean }).momentum,
            timeStamp: event.timeStamp,
        })
        if (kind === "gated" || kind === "coast") {
            if (raw !== 0 || onEdge) event.preventDefault()
            return
        }
        if (kind === "quiet") {
            if (raw !== 0) event.preventDefault()
            return
        }
        let next = raw - event.deltaY
        if (raw === 0) {
            if (wouldStart) {
                event.preventDefault()
                cancelSettle()
                paint(next)
            }
            return
        }
        if (next === 0 || Math.sign(next) !== Math.sign(raw)) {
            cancelSettle()
            paint(0)
            wheel.clear()
            return
        }
        event.preventDefault()
        cancelSettle()
        paint(next)
    }

    const onPointerDown = (event: PointerEvent): void => {
        if (destroyed || event.pointerType === "mouse") return
        if (pointerId !== null) return
        pointerId = event.pointerId
        lastY = event.clientY
    }

    const onPointerMove = (event: PointerEvent): void => {
        if (destroyed || event.pointerId !== pointerId) return
        let dy = event.clientY - lastY
        lastY = event.clientY
        if (raw === 0) {
            let outward = (dy > 0 && atTop(scroller)) || (dy < 0 && atBottom(scroller))
            if (!outward) return
            event.preventDefault()
            try {
                scroller.setPointerCapture(pointerId)
                captured = true
            } catch {
                captured = false
            }
            cancelSettle()
            paint(raw + dy)
            return
        }
        let next = raw + dy
        if (next === 0 || Math.sign(next) !== Math.sign(raw)) {
            cancelSettle()
            paint(0)
            releaseCapture(event.pointerId)
            return
        }
        event.preventDefault()
        cancelSettle()
        paint(next)
    }

    const onPointerUp = (event: PointerEvent): void => {
        if (destroyed || event.pointerId !== pointerId) return
        pointerId = null
        releaseCapture(event.pointerId)
        settle()
    }

    let wheelOpts: AddEventListenerOptions = { passive: false, capture: true }
    let moveOpts: AddEventListenerOptions = { passive: false }

    scroller.addEventListener("wheel", onWheel, wheelOpts)
    scroller.addEventListener("pointerdown", onPointerDown)
    scroller.addEventListener("pointerup", onPointerUp)
    scroller.addEventListener("pointercancel", onPointerUp)
    scroller.addEventListener("pointermove", onPointerMove, moveOpts)

    paint(0)

    return {
        destroy: (): void => {
            if (destroyed) return
            destroyed = true
            cancelSettle()
            wheel.destroy()
            scroller.removeEventListener("wheel", onWheel, wheelOpts)
            scroller.removeEventListener("pointerdown", onPointerDown)
            scroller.removeEventListener("pointerup", onPointerUp)
            scroller.removeEventListener("pointercancel", onPointerUp)
            scroller.removeEventListener("pointermove", onPointerMove, moveOpts)
            if (pointerId !== null) releaseCapture(pointerId)
            pointerId = null
            paint(0)
        },
    }
}
