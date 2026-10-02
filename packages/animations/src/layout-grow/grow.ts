import type { HeavyAnimationLock } from "../core/heavy-lock"
import { createLayoutSizeTween } from "../core/layout-size"
import { MOTION_SETTLE_MS } from "../core/motion-timing"
import { createPlayback } from "../core/playback"
import type { Playback } from "../core/types"

export const LAYOUT_GROW_MS: number = MOTION_SETTLE_MS
export const LAYOUT_GROW_EPSILON_PX: number = 1

export type LayoutGrowAxis = "block" | "inline"

export type LayoutGrow = {
    snapshot: () => number
    play: (toPx: number, durationMs?: number) => Playback
    snap: () => void
    destroy: () => void
}

export function createLayoutGrow(opts: {
    el: HTMLElement
    axis?: LayoutGrowAxis
    observe?: boolean
    isEnabled?: () => boolean
    lock?: HeavyAnimationLock
    durationMs?: number
    onDelta?: (deltaPx: number) => void
}): LayoutGrow {
    let el = opts.el
    let axis: LayoutGrowAxis = opts.axis ?? "block"
    let shouldObserve = opts.observe ?? true
    let isEnabled = opts.isEnabled ?? ((): boolean => true)
    let durationMs = opts.durationMs ?? LAYOUT_GROW_MS
    let onDelta = opts.onDelta
    let sizeProp: "height" | "width" = axis === "inline" ? "width" : "height"

    let overridePx: number | null = null
    let writing = false
    let current: Playback | null = null

    let natural = (): number => (axis === "inline" ? el.offsetWidth : el.offsetHeight)
    let last = natural()
    let lastEmitted = last

    let rebaseToRest = (px: number): void => {
        last = px
        lastEmitted = px
    }

    let withWriting = (fn: () => void): void => {
        writing = true
        try {
            fn()
        } finally {
            writing = false
        }
    }

    let writePx = (px: number): void => {
        withWriting(() => {
            overridePx = px
            el.style[sizeProp] = `${px}px`
            let delta = px - lastEmitted
            if (delta !== 0) {
                onDelta?.(delta)
                lastEmitted = px
            }
        })
    }

    let applyRest = (): void => {
        withWriting(() => {
            overridePx = null
            el.style[sizeProp] = ""
            rebaseToRest(natural())
        })
    }

    let readPx = (): number => overridePx ?? natural()

    let size = createLayoutSizeTween({
        readPx,
        writePx,
        applyRest,
        lock: opts.lock,
    })

    let play = (toPx: number, playMs?: number): Playback => {
        let ms = playMs ?? durationMs
        if (!isEnabled() || ms <= 0) {
            size.snap()
            current = null
            writePx(toPx)
            applyRest()
            let { playback, resolve } = createPlayback()
            resolve(true)
            return playback
        }
        let playback = size.play(toPx, ms)
        current = playback
        last = toPx
        void playback.done.then(() => {
            if (current === playback) current = null
        })
        return playback
    }

    let snapshot = (): number => {
        last = readPx()
        return last
    }

    let snap = (): void => {
        size.snap()
        current = null
    }

    let observer: ResizeObserver | null = null
    if (shouldObserve && typeof ResizeObserver === "function") {
        observer = new ResizeObserver(() => {
            if (writing || current) return
            let next = natural()
            if (Math.abs(next - last) <= LAYOUT_GROW_EPSILON_PX) return
            if (!isEnabled() || durationMs <= 0) {
                rebaseToRest(next)
                return
            }
            writePx(last)
            play(next)
        })
        observer.observe(el)
    }

    return {
        snapshot,
        play,
        snap,
        destroy: (): void => {
            observer?.disconnect()
            observer = null
            snap()
        },
    }
}
