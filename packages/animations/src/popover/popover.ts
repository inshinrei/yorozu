import { animateElement, createPlayback } from "../core/playback"
import { applyStyles, clearStyles } from "../core/styles"
import type { Playback } from "../core/types"

export const POPOVER_MS: number = 120
export const POPOVER_EASING: string = "ease-out"
export const POPOVER_ORIGIN: string = "center top"

const CLOSED: { transform: string; opacity: string } = { transform: "scale(0.92)", opacity: "0" }
const OPEN: { transform: string; opacity: string } = { transform: "scale(1)", opacity: "1" }
const STYLE_KEYS: readonly string[] = ["will-change"]

export type PopoverPlayOptions = {
    origin?: string
    durationMs?: number
    easing?: string
}

export type Popover = {
    playOpen: (el: HTMLElement, options?: PopoverPlayOptions) => Playback
    playClose: (el: HTMLElement, options?: PopoverPlayOptions) => Playback
}

export function createPopover(): Popover {
    let lastOrigin = POPOVER_ORIGIN
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

    let play = (el: HTMLElement, opening: boolean, options?: PopoverPlayOptions): Playback => {
        stopCurrent()
        let { playback, resolve, isCancelled } = createPlayback()
        let durationMs = options?.durationMs ?? POPOVER_MS
        let easing = options?.easing ?? POPOVER_EASING
        if (options?.origin != null) lastOrigin = options.origin
        let origin = options?.origin ?? lastOrigin
        applyStyles(el, { "transform-origin": origin })

        let from = opening ? CLOSED : OPEN
        let to = opening ? OPEN : CLOSED

        if (durationMs <= 0) {
            applyStyles(el, { transform: to.transform, opacity: to.opacity })
            resolve(true)
            return playback
        }

        applyStyles(el, {
            transform: from.transform,
            opacity: from.opacity,
            "will-change": "transform, opacity",
        })

        let anim = animateElement(el, [from, to], {
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
            applyStyles(el, { transform: to.transform, opacity: to.opacity })
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

    return {
        playOpen: (el, options) => play(el, true, options),
        playClose: (el, options) => play(el, false, options),
    }
}
