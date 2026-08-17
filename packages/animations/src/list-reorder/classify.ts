import type { Key } from "../core/types"

export type ReorderAnimKind = "move" | "opacity" | "none"

export type OrderDiffByKey = Map<Key, number>

/** orderDiff = newIndex − oldIndex for keys in curr; new keys → −Infinity. */
export function buildOrderDiff(prev: Map<Key, number>, curr: Map<Key, number>): OrderDiffByKey {
    let diff = new Map<Key, number>()
    for (let [key, newIdx] of curr) {
        let oldIdx = prev.get(key)
        if (oldIdx === undefined) {
            diff.set(key, -Infinity)
            continue
        }
        diff.set(key, newIdx - oldIdx)
    }
    return diff
}

/**
 * Majority vertical direction → move; minority / non-finite → opacity; zero → none.
 * Adjacent swap (1 up, 1 down): up is opacity, down is move.
 */
export function classifyReorderAnim(orderDiffByKey: OrderDiffByKey, key: Key): ReorderAnimKind {
    let orderDiff = orderDiffByKey.get(key)
    if (orderDiff === undefined || orderDiff === 0) return "none"
    if (!Number.isFinite(orderDiff)) return "opacity"

    let numberOfUp = 0
    let numberOfDown = 0
    for (let d of orderDiffByKey.values()) {
        if (!Number.isFinite(d) || d === 0) continue
        if (d < 0) numberOfUp++
        else if (d > 0) numberOfDown++
    }

    // Minority direction (and ties on the up side) fade instead of translate.
    if ((numberOfUp <= numberOfDown && orderDiff < 0) || (numberOfDown < numberOfUp && orderDiff > 0)) {
        return "opacity"
    }
    return "move"
}
