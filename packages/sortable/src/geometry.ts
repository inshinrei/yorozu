export type SortableAxis = "x" | "y"

export type RectSnapshot = {
    key: string | number
    top: number
    bottom: number
    height: number
    mid: number
}

export type AxisSnapshot = {
    key: string | number
    start: number
    end: number
    size: number
    mid: number
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to > arr.length) {
        return arr
    }
    let copy = arr.slice()
    let [item] = copy.splice(from, 1)
    copy.splice(to, 0, item as T)
    return copy
}

export function rectToAxisSnapshot(rect: RectSnapshot): AxisSnapshot {
    return {
        key: rect.key,
        start: rect.top,
        end: rect.bottom,
        size: rect.height,
        mid: rect.mid,
    }
}

export function computeInsertIndex1d(snapshots: AxisSnapshot[], pointer: number): number {
    if (snapshots.length === 0) return 0
    for (let i = 0; i < snapshots.length; i++) {
        if (pointer < snapshots[i]!.mid) {
            return i
        }
    }
    return snapshots.length
}

export function computeInsertIndex(rects: RectSnapshot[], clientY: number): number {
    return computeInsertIndex1d(rects.map(rectToAxisSnapshot), clientY)
}

export function readAxisSnapshot(el: HTMLElement, axis: SortableAxis, key: string | number): AxisSnapshot {
    let rect = el.getBoundingClientRect()
    if (axis === "y") {
        let start = rect.top
        let size = rect.height
        return { key, start, end: rect.bottom, size, mid: start + size / 2 }
    }
    let start = rect.left
    let size = rect.width
    return { key, start, end: rect.right, size, mid: start + size / 2 }
}

export function toTargetIndex(srcIdx: number, visualIdx: number): number {
    return visualIdx > srcIdx ? visualIdx - 1 : visualIdx
}
