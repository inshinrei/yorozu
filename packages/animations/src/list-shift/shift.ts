import type { HeavyAnimationLock } from "../core/heavy-lock"
import { MOTION_SETTLE_MS, MOTION_SPRING_EASE } from "../core/motion-timing"
import { animateElement } from "../core/playback"
import type { AttachHandle, Key } from "../core/types"

export const LIST_SHIFT_MS: number = MOTION_SETTLE_MS
export const LIST_SHIFT_EASING: string = MOTION_SPRING_EASE
export const LIST_SHIFT_EPSILON_PX: number = 1

export type ListShift = {
    register: (el: HTMLElement, key: Key) => AttachHandle
    snapshot: () => void
    play: (options?: { durationMs?: number }) => void
    cancel: () => void
    destroy: () => void
}

export function createListShift(opts: {
    root: HTMLElement
    observe?: boolean
    isEnabled?: () => boolean
    lock?: HeavyAnimationLock
    durationMs?: number
    easing?: string
}): ListShift {
    let root = opts.root
    let shouldObserve = opts.observe ?? true
    let isEnabled = opts.isEnabled ?? ((): boolean => true)
    let durationMs = opts.durationMs ?? LIST_SHIFT_MS
    let easing = opts.easing ?? LIST_SHIFT_EASING
    let lock = opts.lock

    let itemEls = new Map<Key, HTMLElement>()
    let lastTop = new Map<Key, number>()
    let activeAnims = new Map<Key, Animation>()
    let destroyed = false
    let playing = false
    let playId = 0
    let releaseLock: (() => void) | null = null

    let relTop = (el: HTMLElement): number => el.getBoundingClientRect().top - root.getBoundingClientRect().top

    let cancelAnim = (key: Key): void => {
        let anim = activeAnims.get(key)
        if (!anim) return
        anim.cancel()
        activeAnims.delete(key)
    }

    let cancelAll = (): void => {
        for (let key of [...activeAnims.keys()]) {
            cancelAnim(key)
        }
    }

    let rebaseAll = (): void => {
        for (let [key, el] of itemEls) {
            lastTop.set(key, relTop(el))
        }
    }

    let releaseIfHeld = (): void => {
        releaseLock?.()
        releaseLock = null
    }

    let trackAnim = (key: Key, anim: Animation): void => {
        activeAnims.set(key, anim)
        let captured = anim
        anim.finished
            .then((): void => {
                if (activeAnims.get(key) === captured) activeAnims.delete(key)
            })
            .catch((): void => {})
    }

    let invert = (ms: number): void => {
        if (!isEnabled() || ms <= 0) {
            rebaseAll()
            return
        }

        playId += 1
        let id = playId
        releaseIfHeld()
        releaseLock = lock?.acquire("list-shift", { level: "any", durationMs: ms }) ?? null
        playing = true
        let remaining = 0

        let finish = (): void => {
            if (id !== playId) return
            remaining -= 1
            if (remaining > 0) return
            playing = false
            releaseIfHeld()
        }

        for (let [key, el] of itemEls) {
            let now = relTop(el)
            let prev = lastTop.get(key)
            lastTop.set(key, now)
            if (prev === undefined) continue
            let delta = prev - now
            if (Math.abs(delta) <= LIST_SHIFT_EPSILON_PX) continue
            cancelAnim(key)
            let anim = animateElement(el, [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
                duration: ms,
                easing,
            })
            if (!anim) continue
            remaining += 1
            trackAnim(key, anim)
            void anim.finished.then(finish, finish)
        }

        if (remaining === 0) {
            playing = false
            releaseIfHeld()
        }
    }

    let play = (options?: { durationMs?: number }): void => {
        if (destroyed) return
        invert(options?.durationMs ?? durationMs)
    }

    let observer: ResizeObserver | null = null
    if (shouldObserve && typeof ResizeObserver === "function") {
        observer = new ResizeObserver((): void => {
            if (destroyed || playing) return
            invert(durationMs)
        })
    }

    let snapshot = (): void => {
        if (destroyed) return
        rebaseAll()
    }

    let cancel = (): void => {
        playId += 1
        cancelAll()
        playing = false
        releaseIfHeld()
    }

    let register = (el: HTMLElement, key: Key): AttachHandle => {
        if (destroyed) {
            return {
                update: (): void => {},
                destroy: (): void => {},
            }
        }
        itemEls.set(key, el)
        lastTop.set(key, relTop(el))
        observer?.observe(el)
        return {
            update: (next: Key): void => {
                if (destroyed || next === key) return
                cancelAnim(key)
                if (itemEls.get(key) === el) itemEls.delete(key)
                let top = lastTop.get(key)
                lastTop.delete(key)
                key = next
                itemEls.set(key, el)
                if (top !== undefined) lastTop.set(key, top)
                else lastTop.set(key, relTop(el))
            },
            destroy: (): void => {
                observer?.unobserve(el)
                if (itemEls.get(key) === el) itemEls.delete(key)
                lastTop.delete(key)
                cancelAnim(key)
            },
        }
    }

    return {
        register,
        snapshot,
        play,
        cancel,
        destroy: (): void => {
            if (destroyed) return
            destroyed = true
            cancel()
            observer?.disconnect()
            observer = null
            itemEls.clear()
            lastTop.clear()
        },
    }
}
