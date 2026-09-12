export const LIST_SLICE_MIN: number = 16
export const LIST_SLICE_MAX: number = 48
export const LIST_SLICE_OVERSCAN_ROWS: number = 4

export function heightPrefix(count: number, heightAt: (i: number) => number): number[] {
    let prefix: number[] = new Array(count + 1)
    prefix[0] = 0
    for (let i = 0; i < count; i++) {
        prefix[i + 1] = prefix[i]! + heightAt(i)
    }
    return prefix
}

export function firstVisibleIndexFromPrefix(prefix: number[], scrollTop: number): number {
    let count = prefix.length - 1
    if (count <= 0 || scrollTop <= 0) return 0

    // Smallest i in 0..count-1 such that prefix[i+1] > scrollTop
    let lo = 0
    let hi = count - 1
    while (lo < hi) {
        let mid = (lo + hi) >>> 1
        if (prefix[mid + 1]! > scrollTop) {
            hi = mid
        } else {
            lo = mid + 1
        }
    }
    return lo
}

export function rowTopFromPrefix(prefix: number[], index: number): number {
    if (prefix.length === 0) return 0
    let clamped = Math.max(0, Math.min(index, prefix.length - 1))
    return prefix[clamped]!
}

export function paintedIndexRange(
    scrollTop: number,
    viewportHeight: number,
    itemHeight: number,
    count: number,
): { start: number; end: number } {
    if (itemHeight <= 0 || viewportHeight <= 0 || count <= 0) {
        return { start: 0, end: 0 }
    }
    let start = Math.max(0, Math.floor(scrollTop / itemHeight))
    let end = Math.min(count, Math.ceil((scrollTop + viewportHeight) / itemHeight))
    if (start > count) start = count
    if (end < start) end = start
    return { start, end }
}

export function listSliceForViewport(
    viewportHeight: number,
    itemHeight: number,
    opts?: { min?: number; max?: number; overscanRows?: number },
): number {
    let min = opts?.min ?? LIST_SLICE_MIN
    let max = opts?.max ?? LIST_SLICE_MAX
    let overscanRows = opts?.overscanRows ?? LIST_SLICE_OVERSCAN_ROWS
    if (viewportHeight <= 0 || itemHeight <= 0) return min
    let raw = Math.ceil(viewportHeight / itemHeight) + overscanRows
    return Math.max(min, Math.min(max, raw))
}
