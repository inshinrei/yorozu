import { animateElement, createPlayback } from "../core/playback"
import type { Playback } from "../core/types"
import { DIGIT_FLIP_MS } from "./slots"

export const DIGIT_FLIP_EASING: string = "ease"
export const PRESENCE_POP_MS: number = 200
export const PRESENCE_POP_EASING: string = "ease"

function playTransform(
    el: HTMLElement,
    frames: Keyframe[],
    options?: { durationMs?: number; easing?: string },
    fallbackMs: number = DIGIT_FLIP_MS,
    fallbackEasing: string = DIGIT_FLIP_EASING,
): Playback {
    let { playback, resolve } = createPlayback()
    let durationMs = options?.durationMs ?? fallbackMs
    let easing = options?.easing ?? fallbackEasing
    let anim = animateElement(el, frames, { duration: durationMs, easing, fill: "forwards" })
    if (!anim) {
        resolve(true)
        return playback
    }
    let cancel = playback.cancel
    playback.cancel = () => {
        anim.cancel()
        cancel()
    }
    void anim.finished.then(
        () => resolve(true),
        () => resolve(false),
    )
    return playback
}

export function playDigitFlip(
    el: HTMLElement,
    options?: { durationMs?: number; easing?: string },
): Playback {
    return playTransform(
        el,
        [{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }],
        options,
    )
}

export function playPresencePop(
    el: HTMLElement,
    options?: { durationMs?: number; easing?: string },
): Playback {
    return playTransform(
        el,
        [
            { transform: "scale(0.6)", opacity: "0" },
            { transform: "scale(1)", opacity: "1" },
        ],
        options,
        PRESENCE_POP_MS,
        PRESENCE_POP_EASING,
    )
}
