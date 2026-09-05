import { animateElement } from "../core/playback"
import type { AttachHandle, Key } from "../core/types"
import { buildOrderDiff, classifyReorderAnim } from "./classify"

export const LIST_REORDER_MS: number = 200
export const LIST_REORDER_EASING: string = "ease-out"
export const LIST_REORDER_EPSILON_PX: number = 1

export type ListReorderSyncOptions = {
    fromTranslateY?: ReadonlyMap<Key, number>
}

export type ListReorder<T> = {
    register: (el: HTMLElement, key: Key) => AttachHandle
    sync: (items: readonly T[], options?: ListReorderSyncOptions) => void
    cancel: () => void
    destroy: () => void
}

export function createListReorder<T>(options: {
    getItemHeight: () => number
    getKey: (item: T, index: number) => Key
    isEnabled?: () => boolean
    isReduced?: () => boolean
    isSuppressed?: () => boolean
    durationMs?: number
    easing?: string
    getFromTranslateY?: (key: Key) => number | undefined
}): ListReorder<T> {
    let durationMs = options.durationMs ?? LIST_REORDER_MS
    let easing = options.easing ?? LIST_REORDER_EASING
    let isEnabled = options.isEnabled ?? ((): boolean => true)
    let isReduced = options.isReduced ?? ((): boolean => false)
    let isSuppressed = options.isSuppressed ?? ((): boolean => false)
    let getFromTranslateY = options.getFromTranslateY

    let itemEls = new Map<Key, HTMLElement>()
    let activeAnims = new Map<Key, Animation>()
    let prevIndexByKey: Map<Key, number> | null = null
    let destroyed = false

    let buildIndexMap = (items: readonly T[]): Map<Key, number> => {
        let map = new Map<Key, number>()
        for (let i = 0; i < items.length; i++) {
            map.set(options.getKey(items[i]!, i), i)
        }
        return map
    }

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

    let trackAnim = (key: Key, anim: Animation): void => {
        activeAnims.set(key, anim)
        let captured = anim
        anim.finished
            .then((): void => {
                if (activeAnims.get(key) === captured) activeAnims.delete(key)
            })
            .catch((): void => {})
    }

    let playMove = (key: Key, el: HTMLElement, px: number): void => {
        cancelAnim(key)
        let anim = animateElement(el, [{ transform: `translateY(${px}px)` }, { transform: "translateY(0)" }], {
            duration: durationMs,
            easing,
        })
        if (!anim) return
        trackAnim(key, anim)
    }

    let register = (el: HTMLElement, key: Key): AttachHandle => {
        if (destroyed) {
            return {
                update: (): void => {},
                destroy: (): void => {},
            }
        }
        itemEls.set(key, el)
        return {
            update: (next: Key): void => {
                if (destroyed || next === key) return
                cancelAnim(key)
                if (itemEls.get(key) === el) itemEls.delete(key)
                key = next
                itemEls.set(key, el)
            },
            destroy: (): void => {
                if (itemEls.get(key) === el) itemEls.delete(key)
                cancelAnim(key)
            },
        }
    }

    let sync = (items: readonly T[], syncOptions?: ListReorderSyncOptions): void => {
        if (destroyed) return
        if (!isEnabled() || isReduced()) {
            // Disabled / reduced: drop baseline so the next enabled sync re-baselines.
            prevIndexByKey = null
            return
        }

        let curr = buildIndexMap(items)
        if (isSuppressed()) {
            prevIndexByKey = curr
            return
        }

        let fromMap = syncOptions?.fromTranslateY
        let prev = prevIndexByKey
        let orderDiffByKey = prev ? buildOrderDiff(prev, curr) : null
        let itemHeight = orderDiffByKey ? options.getItemHeight() : 0

        for (let [key, el] of itemEls) {
            let px = fromMap?.has(key) ? fromMap.get(key) : getFromTranslateY?.(key)
            if (typeof px === "number" && Number.isFinite(px) && Math.abs(px) > LIST_REORDER_EPSILON_PX) {
                playMove(key, el, px)
                continue
            }

            if (!prev || !orderDiffByKey) continue

            let kind = classifyReorderAnim(orderDiffByKey, key)
            if (kind === "none") continue

            if (kind === "opacity") {
                cancelAnim(key)
                let anim = animateElement(el, [{ opacity: 0 }, { opacity: 1 }], {
                    duration: durationMs,
                    easing,
                })
                if (!anim) continue
                trackAnim(key, anim)
                continue
            }

            let orderDiff = orderDiffByKey.get(key) ?? 0
            let delta = -orderDiff * itemHeight
            if (Math.abs(delta) <= LIST_REORDER_EPSILON_PX) continue
            playMove(key, el, delta)
        }

        prevIndexByKey = curr
    }

    let cancel = (): void => {
        cancelAll()
    }

    let destroy = (): void => {
        if (destroyed) return
        destroyed = true
        cancelAll()
        itemEls.clear()
        prevIndexByKey = null
    }

    return { register, sync, cancel, destroy }
}
