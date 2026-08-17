import { tween } from "../core/tween"
import type { Playback } from "../core/types"

export const SWIPE_THRESHOLD: number = 56
export const SWIPE_MAX: number = 80
export const SWIPE_TWEEN_MS: number = 200

export function shouldCommitSwipe(offset: number, threshold: number): boolean {
    return offset >= threshold
}

export function rubberSwipeOffset(delta: number, max: number): number {
    if (delta <= 0) return 0
    if (delta <= max) return delta
    let overflow = delta - max
    return max + overflow / (1 + overflow / max)
}

export type SwipeRevealOptions = {
    axis?: "x"
    threshold?: number
    max?: number
    durationMs?: number
    onCommit: () => void
}

export type SwipeReveal = {
    destroy: () => void
}

function applyOffset(el: HTMLElement, offset: number): void {
    el.style.setProperty("transform", `translateX(${offset}px)`)
}

export function createSwipeReveal(el: HTMLElement, options: SwipeRevealOptions): SwipeReveal {
    let threshold = options.threshold ?? SWIPE_THRESHOLD
    let max = options.max ?? SWIPE_MAX
    let dragging = false
    let startX = 0
    let current = 0
    let playback: Playback | null = null

    let stopTween = (): void => {
        if (!playback) return
        playback.cancel()
        playback = null
    }

    let settleTo = (target: number): void => {
        stopTween()
        let from = current
        let run = tween({
            from,
            to: target,
            durationMs: options.durationMs ?? SWIPE_TWEEN_MS,
            onUpdate: (value) => {
                current = value
                applyOffset(el, value)
            },
        })
        playback = run
        void run.done.then(() => {
            if (playback === run) playback = null
        })
    }

    let onPointerDown = (event: PointerEvent): void => {
        stopTween()
        dragging = true
        startX = event.clientX - current
        if (typeof el.setPointerCapture === "function") el.setPointerCapture(event.pointerId)
    }

    let onPointerMove = (event: PointerEvent): void => {
        if (!dragging) return
        current = rubberSwipeOffset(event.clientX - startX, max)
        applyOffset(el, current)
    }

    let onPointerUp = (event: PointerEvent): void => {
        if (!dragging) return
        dragging = false
        if (typeof el.releasePointerCapture === "function") {
            try {
                el.releasePointerCapture(event.pointerId)
            } catch {
                // already released
            }
        }
        if (shouldCommitSwipe(current, threshold)) {
            options.onCommit()
            settleTo(max)
        } else {
            settleTo(0)
        }
    }

    el.addEventListener("pointerdown", onPointerDown)
    el.addEventListener("pointermove", onPointerMove)
    el.addEventListener("pointerup", onPointerUp)
    el.addEventListener("pointercancel", onPointerUp)

    return {
        destroy: () => {
            stopTween()
            dragging = false
            el.removeEventListener("pointerdown", onPointerDown)
            el.removeEventListener("pointermove", onPointerMove)
            el.removeEventListener("pointerup", onPointerUp)
            el.removeEventListener("pointercancel", onPointerUp)
        },
    }
}
