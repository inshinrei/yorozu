import { lerp, tween } from "../core/tween"
import type { Playback } from "../core/types"

export const SCROLL_TWEEN_MS: number = 200

export type ScrollTweenOptions = {
    left?: number
    top?: number
    durationMs?: number
}

const activeByEl = new WeakMap<HTMLElement, Playback>()

export function playScrollTween(el: HTMLElement, options: ScrollTweenOptions): Playback {
    activeByEl.get(el)?.cancel()

    let fromLeft = el.scrollLeft
    let fromTop = el.scrollTop
    let toLeft = options.left ?? fromLeft
    let toTop = options.top ?? fromTop
    let durationMs = options.durationMs ?? SCROLL_TWEEN_MS

    let playback = tween({
        from: 0,
        to: 1,
        durationMs,
        onUpdate: (t) => {
            if (options.left != null) el.scrollLeft = lerp(fromLeft, toLeft, t)
            if (options.top != null) el.scrollTop = lerp(fromTop, toTop, t)
        },
    })
    activeByEl.set(el, playback)
    void playback.done.finally(() => {
        if (activeByEl.get(el) === playback) activeByEl.delete(el)
    })
    return playback
}
