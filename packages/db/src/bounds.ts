import type { IndexKey, ScanBound } from "./types"

type Cmp = -1 | 0 | 1

function rankOf(value: unknown): 0 | 1 | 2 {
    if (typeof value === "number") {
        if (Number.isNaN(value)) throw new TypeError("NaN is not a valid index key")
        return 0
    }
    if (typeof value === "string") return 1
    if (Array.isArray(value)) {
        for (let item of value) rankOf(item)
        return 2
    }
    let kind = value === null ? "null" : typeof value
    throw new TypeError(`unsupported index key type: ${kind}`)
}

function cmp(a: unknown, b: unknown): Cmp {
    let ra = rankOf(a)
    let rb = rankOf(b)
    if (ra < rb) return -1
    if (ra > rb) return 1
    if (ra === 0) {
        let na = a as number
        let nb = b as number
        if (na < nb) return -1
        if (na > nb) return 1
        return 0
    }
    if (ra === 1) {
        let sa = a as string
        let sb = b as string
        if (sa < sb) return -1
        if (sa > sb) return 1
        return 0
    }
    let aa = a as unknown[]
    let ba = b as unknown[]
    let n = Math.min(aa.length, ba.length)
    for (let i = 0; i < n; i++) {
        let c = cmp(aa[i], ba[i])
        if (c !== 0) return c
    }
    if (aa.length < ba.length) return -1
    if (aa.length > ba.length) return 1
    return 0
}

/** number < string < array; prefix-equal shorter array is less. */
export function compareIndexKey(a: IndexKey, b: IndexKey): -1 | 0 | 1 {
    return cmp(a, b)
}

/** Inclusive/exclusive bounds using compareIndexKey. limit / keysOnly are ignored. */
export function inRange(indexKey: IndexKey, bound: ScanBound = {}): boolean {
    if (bound.gt !== undefined && compareIndexKey(indexKey, bound.gt) <= 0) return false
    if (bound.gte !== undefined && compareIndexKey(indexKey, bound.gte) < 0) return false
    if (bound.lt !== undefined && compareIndexKey(indexKey, bound.lt) >= 0) return false
    if (bound.lte !== undefined && compareIndexKey(indexKey, bound.lte) > 0) return false
    return true
}
