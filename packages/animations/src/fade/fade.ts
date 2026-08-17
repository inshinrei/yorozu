import { animateElement, createPlayback } from "../core/playback"
import { applyStyles, clearStyles } from "../core/styles"
import type { Playback } from "../core/types"

export const FADE_MS: number = 120
export const FADE_EASING: string = "ease-out"

const STYLE_KEYS: readonly string[] = ["will-change"]

export type FadeOptions = {
    durationMs?: number
    easing?: string
}

export type Fade = {
    setVisible: (visible: boolean) => Playback
}

export function createFade(el: HTMLElement, options?: FadeOptions): Fade {
    let durationMs = options?.durationMs ?? FADE_MS
    let easing = options?.easing ?? FADE_EASING
    let lastVisible: boolean | undefined
    let current: {
        anim: Animation | null
        resolve: (ran: boolean) => void
    } | null = null

    let stopCurrent = (): void => {
        if (!current) return
        current.anim?.cancel()
        current.resolve(false)
        current = null
    }

    let setVisible = (visible: boolean): Playback => {
        if (lastVisible === visible && !current) {
            let { playback, resolve } = createPlayback()
            resolve(true)
            return playback
        }

        stopCurrent()
        lastVisible = visible
        let { playback, resolve, isCancelled } = createPlayback()
        let from = visible ? "0" : "1"
        let to = visible ? "1" : "0"

        if (durationMs <= 0) {
            applyStyles(el, { opacity: to })
            resolve(true)
            return playback
        }

        applyStyles(el, { opacity: from, "will-change": "opacity" })
        let anim = animateElement(el, [{ opacity: from }, { opacity: to }], {
            duration: durationMs,
            easing,
            fill: "forwards",
        })
        let run = { anim, resolve }
        current = run

        let finish = (ran: boolean): void => {
            if (current !== run) return
            current = null
            clearStyles(el, STYLE_KEYS)
            applyStyles(el, { opacity: to })
            resolve(ran)
        }

        let cancel = playback.cancel
        playback.cancel = () => {
            if (current === run) {
                anim?.cancel()
                current = null
                clearStyles(el, STYLE_KEYS)
            }
            cancel()
        }

        if (!anim) {
            finish(true)
            return playback
        }

        void anim.finished.then(
            () => finish(true),
            () => {
                if (!isCancelled() && current === run) finish(false)
            },
        )
        return playback
    }

    return { setVisible }
}
