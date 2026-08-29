import { compareIndexKey, type IndexKey, type ScanBound } from "@yorozu/db"

type BoundEdge = { key: IndexKey; open: boolean }

function pickLower(bound: ScanBound): BoundEdge | undefined {
    if (bound.gt !== undefined && bound.gte !== undefined) {
        if (compareIndexKey(bound.gt, bound.gte) < 0) return { key: bound.gte, open: false }
        return { key: bound.gt, open: true }
    }
    if (bound.gte !== undefined) return { key: bound.gte, open: false }
    if (bound.gt !== undefined) return { key: bound.gt, open: true }
    return undefined
}

function pickUpper(bound: ScanBound): BoundEdge | undefined {
    if (bound.lt !== undefined && bound.lte !== undefined) {
        if (compareIndexKey(bound.lt, bound.lte) <= 0) return { key: bound.lt, open: true }
        return { key: bound.lte, open: false }
    }
    if (bound.lte !== undefined) return { key: bound.lte, open: false }
    if (bound.lt !== undefined) return { key: bound.lt, open: true }
    return undefined
}

function isDataError(err: unknown): boolean {
    return err instanceof Error && err.name === "DataError"
}

/**
 * IDBKeyRange for ScanBound using IDB array-key order.
 * `undefined` = unbounded; `null` = empty (no matches).
 */
export function toIdbKeyRange(
    bound: ScanBound = {},
    KeyRange: typeof IDBKeyRange = globalThis.IDBKeyRange,
): IDBKeyRange | null | undefined {
    let lower = pickLower(bound)
    let upper = pickUpper(bound)
    if (!lower && !upper) return undefined
    try {
        if (lower && upper) return KeyRange.bound(lower.key, upper.key, lower.open, upper.open)
        if (lower) return KeyRange.lowerBound(lower.key, lower.open)
        if (upper) return KeyRange.upperBound(upper.key, upper.open)
        return undefined
    } catch (err) {
        if (isDataError(err)) return null
        throw err
    }
}
