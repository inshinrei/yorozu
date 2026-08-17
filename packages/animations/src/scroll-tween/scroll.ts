import { lerp, tween } from "../core/tween"
import type { Playback } from "../core/types"

export const SCROLL_TWEEN_MS: number = 200

export type ScrollTweenOptions = {
    left?: number
    top?: number
    durationMs?: number
}

export function playScrollTween(el: HTMLElement, options: ScrollTweenOptions): Playback {
    let fromLeft = el.scrollLeft
    let fromTop = el.scrollTop
    let toLeft = options.left ?? fromLeft
    let toTop = options.top ?? fromTop
    let durationMs = options.durationMs ?? SCROLL_TWEEN_MS

    return tween({
        from: 0,
        to: 1,
        durationMs,
        onUpdate: (t) => {
            if (options.left != null) el.scrollLeft = lerp(fromLeft, toLeft, t)
            if (options.top != null) el.scrollTop = lerp(fromTop, toTop, t)
        },
    })
}
