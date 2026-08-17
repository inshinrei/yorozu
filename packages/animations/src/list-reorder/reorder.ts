import { animateElement } from "../core/playback"
import type { AttachHandle, Key } from "../core/types"
import { buildOrderDiff, classifyReorderAnim } from "./classify"

export const LIST_REORDER_MS: number = 200
export const LIST_REORDER_EASING: string = "ease-out"
export const LIST_REORDER_EPSILON_PX: number = 1

export type ListReorder<T> = {
    register: (el: HTMLElement, key: Key) => AttachHandle
    sync: (items: readonly T[]) => void
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
}): ListReorder<T> {
    let durationMs = options.durationMs ?? LIST_REORDER_MS
    let easing = options.easing ?? LIST_REORDER_EASING
    let isEnabled = options.isEnabled ?? ((): boolean => true)
    let isReduced = options.isReduced ?? ((): boolean => false)
    let isSuppressed = options.isSuppressed ?? ((): boolean => false)

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

    let register = (el: HTMLElement, key: Key): AttachHandle => {
        itemEls.set(key, el)
        return {
            update: (next: Key): void => {
                if (next === key) return
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

    let sync = (items: readonly T[]): void => {
        if (destroyed) return
        if (!isEnabled() || isReduced()) {
            // Disabled / reduced: drop baseline so the next enabled sync re-baselines.
            prevIndexByKey = null
            return
        }

        let curr = buildIndexMap(items)
        let prev = prevIndexByKey
        let suppressed = isSuppressed()

        if (prev && !suppressed) {
            let orderDiffByKey = buildOrderDiff(prev, curr)
            let itemHeight = options.getItemHeight()

            for (let [key, el] of itemEls) {
                let kind = classifyReorderAnim(orderDiffByKey, key)
                if (kind === "none") continue

                cancelAnim(key)

                let anim: Animation | null
                if (kind === "opacity") {
                    anim = animateElement(el, [{ opacity: 0 }, { opacity: 1 }], {
                        duration: durationMs,
                        easing,
                    })
                } else {
                    let orderDiff = orderDiffByKey.get(key) ?? 0
                    let delta = -orderDiff * itemHeight
                    if (Math.abs(delta) <= LIST_REORDER_EPSILON_PX) continue
                    anim = animateElement(
                        el,
                        [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
                        {
                            duration: durationMs,
                            easing,
                        },
                    )
                }

                if (!anim) continue
                activeAnims.set(key, anim)
                let captured = anim
                anim.finished
                    .then((): void => {
                        if (activeAnims.get(key) === captured) activeAnims.delete(key)
                    })
                    .catch((): void => {})
            }
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
