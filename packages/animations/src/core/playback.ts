import type { Playback } from "./types"

export function createPlayback(): {
    playback: Playback
    resolve: (ran: boolean) => void
    isCancelled: () => boolean
} {
    let cancelled = false
    let settled = false
    let resolveDone!: (ran: boolean) => void
    let done = new Promise<boolean>((resolve) => {
        resolveDone = resolve
    })

    let resolve = (ran: boolean): void => {
        if (settled) return
        settled = true
        resolveDone(cancelled ? false : ran)
    }

    let playback: Playback = {
        done,
        cancel: () => {
            cancelled = true
            resolve(false)
        },
    }

    return {
        playback,
        resolve,
        isCancelled: () => cancelled,
    }
}

export function animateElement(
    el: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
): Animation | null {
    if (typeof (el as HTMLElement).animate !== "function") return null
    return (el as HTMLElement).animate(keyframes, options)
}
