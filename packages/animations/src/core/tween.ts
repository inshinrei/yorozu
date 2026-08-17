import { createPlayback } from "./playback"
import type { Playback } from "./types"

export function easeOutCubic(t: number): number {
    let u = t < 0 ? 0 : t > 1 ? 1 : t
    return 1 - (1 - u) ** 3
}

export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t
}

export type TweenOptions = {
    from: number
    to: number
    durationMs: number
    easing?: (t: number) => number
    onUpdate: (value: number) => void
}

export function tween(options: TweenOptions): Playback {
    let { playback, resolve, isCancelled } = createPlayback()
    let ease = options.easing ?? easeOutCubic
    let durationMs = Math.max(0, options.durationMs)

    if (durationMs <= 0) {
        options.onUpdate(options.to)
        resolve(true)
        return playback
    }

    let start = performance.now()
    let frame = 0

    let tick = (now: number): void => {
        if (isCancelled()) {
            resolve(false)
            return
        }
        let t = Math.min(1, (now - start) / durationMs)
        options.onUpdate(lerp(options.from, options.to, ease(t)))
        if (t >= 1) {
            resolve(true)
            return
        }
        frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    let cancel = playback.cancel
    playback.cancel = () => {
        cancelAnimationFrame(frame)
        cancel()
    }
    return playback
}
