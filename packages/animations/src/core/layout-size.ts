import { queueMeasure, queueMutate } from "./dom-schedule"
import type { HeavyAnimationLock } from "./heavy-lock"
import { createPlayback } from "./playback"
import { tween } from "./tween"
import type { Playback } from "./types"

export type LayoutSizeTween = {
    play(toPx: number, durationMs: number): Playback
    snap(): void
}

type Run = {
    playback: Playback
    inner: Playback | null
    release: (() => void) | null
}

export function createLayoutSizeTween(opts: {
    readPx: () => number
    writePx: (px: number) => void
    applyRest: () => void
    lock?: HeavyAnimationLock
}): LayoutSizeTween {
    let readPx = opts.readPx
    let writePx = opts.writePx
    let applyRest = opts.applyRest
    let lock = opts.lock
    let current: Run | null = null

    let stop = (): void => {
        current?.playback.cancel()
    }

    let play = (toPx: number, durationMs: number): Playback => {
        stop()
        let { playback, resolve } = createPlayback()
        let run: Run = { playback, inner: null, release: null }
        current = run

        let settle = playback.cancel
        playback.cancel = () => {
            if (current === run) {
                current = null
                run.inner?.cancel()
                applyRest()
                run.release?.()
            }
            settle()
        }

        queueMeasure(() => {
            if (current !== run) return
            let from = readPx()
            if (durationMs <= 0) {
                queueMutate(() => {
                    if (current !== run) return
                    writePx(toPx)
                    current = null
                    applyRest()
                    resolve(true)
                })
                return
            }
            run.release = lock?.acquire("layout-size", { level: "any", durationMs }) ?? null
            let inner = tween({
                from,
                to: toPx,
                durationMs,
                onUpdate: (px) =>
                    queueMutate(() => {
                        if (current !== run) return
                        writePx(px)
                    }),
            })
            run.inner = inner
            void inner.done.then((ran) => {
                if (current !== run) return
                queueMutate(() => {
                    if (current !== run) return
                    current = null
                    applyRest()
                    run.release?.()
                    resolve(ran)
                })
            })
        })

        return playback
    }

    let snap = (): void => {
        if (current) {
            stop()
            return
        }
        applyRest()
    }

    return { play, snap }
}
