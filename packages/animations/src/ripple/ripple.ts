import { animateElement, createPlayback } from "../core/playback"
import { applyStyles } from "../core/styles"
import type { Playback } from "../core/types"

export const RIPPLE_MS: number = 400
export const RIPPLE_EASING: string = "ease-out"
export const RIPPLE_COLOR: string = "currentColor"
export const RIPPLE_SIZE_PX: number = 48

export type RippleOptions = {
    x: number
    y: number
    color?: string
    durationMs?: number
    easing?: string
}

export function playRipple(host: HTMLElement, options: RippleOptions): Playback {
    let { playback, resolve } = createPlayback()
    let durationMs = options.durationMs ?? RIPPLE_MS
    let easing = options.easing ?? RIPPLE_EASING
    let ink = document.createElement("span")
    applyStyles(ink, {
        position: "absolute",
        left: `${options.x}px`,
        top: `${options.y}px`,
        width: `${RIPPLE_SIZE_PX}px`,
        height: `${RIPPLE_SIZE_PX}px`,
        "border-radius": "50%",
        background: options.color ?? RIPPLE_COLOR,
        "pointer-events": "none",
        "transform-origin": "center center",
    })
    host.appendChild(ink)

    let anim = animateElement(
        ink,
        [
            { transform: "translate(-50%, -50%) scale(0)", opacity: "1" },
            { transform: "translate(-50%, -50%) scale(1)", opacity: "0" },
        ],
        { duration: durationMs, easing, fill: "forwards" },
    )

    let teardown = (): void => {
        if (ink.parentNode) ink.remove()
    }

    let cancel = playback.cancel
    playback.cancel = () => {
        anim?.cancel()
        teardown()
        cancel()
    }

    let finish = (ran: boolean): void => {
        teardown()
        resolve(ran)
    }

    if (!anim) {
        finish(true)
        return playback
    }

    void anim.finished.then(
        () => finish(true),
        () => finish(false),
    )
    return playback
}
