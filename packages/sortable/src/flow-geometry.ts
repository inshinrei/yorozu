import { toTargetIndex } from "./geometry"

export type FlowOffset = { x: number; y: number }

export type FlowRectSnapshot = {
    key: string | number
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
    cx: number
    cy: number
}

export function readFlowRectSnapshot(el: HTMLElement, key: string | number): FlowRectSnapshot {
    let r = el.getBoundingClientRect()
    let left = r.left
    let top = r.top
    let width = r.width
    let height = r.height
    return {
        key,
        left,
        top,
        right: r.right,
        bottom: r.bottom,
        width,
        height,
        cx: left + width / 2,
        cy: top + height / 2,
    }
}

function groupFlowRows(rects: readonly FlowRectSnapshot[]): FlowRectSnapshot[][] {
    if (rects.length === 0) return []
    let minH = Infinity
    for (let r of rects) {
        if (r.height < minH) minH = r.height
    }
    let tol = minH / 2
    let rows: FlowRectSnapshot[][] = []
    let current: FlowRectSnapshot[] = [rects[0]!]
    let rowBottom = rects[0]!.bottom
    for (let i = 1; i < rects.length; i++) {
        let item = rects[i]!
        if (item.top < rowBottom - tol) {
            current.push(item)
            if (item.bottom > rowBottom) rowBottom = item.bottom
        } else {
            rows.push(current)
            current = [item]
            rowBottom = item.bottom
        }
    }
    rows.push(current)
    return rows
}

export function computeInsertIndexFlow(rects: readonly FlowRectSnapshot[], pointerX: number, pointerY: number): number {
    if (rects.length === 0) return 0
    let rows = groupFlowRows(rects)
    let row: FlowRectSnapshot[] | null = null
    for (let candidate of rows) {
        let maxBottom = candidate[0]!.bottom
        for (let item of candidate) {
            if (item.bottom > maxBottom) maxBottom = item.bottom
        }
        if (pointerY <= maxBottom) {
            row = candidate
            break
        }
    }
    if (row == null) return rects.length
    for (let item of row) {
        if (item.cx > pointerX) return rects.indexOf(item)
    }
    let last = row[row.length - 1]!
    return rects.indexOf(last) + 1
}

export function shiftFlowRects(rects: readonly FlowRectSnapshot[], dx: number, dy: number): FlowRectSnapshot[] {
    return rects.map((r) => ({
        key: r.key,
        left: r.left + dx,
        top: r.top + dy,
        right: r.right + dx,
        bottom: r.bottom + dy,
        width: r.width,
        height: r.height,
        cx: r.cx + dx,
        cy: r.cy + dy,
    }))
}

export function flowShiftDestIndex(srcIndex: number, insertIndex: number, itemIndex: number): number | null {
    if (itemIndex === srcIndex) return null
    let o = toTargetIndex(srcIndex, insertIndex)
    if (itemIndex > srcIndex && itemIndex <= o) return itemIndex - 1
    if (itemIndex < srcIndex && itemIndex >= o) return itemIndex + 1
    return null
}

export function flowRectDelta(from: FlowRectSnapshot, to: FlowRectSnapshot): FlowOffset {
    return { x: to.left - from.left, y: to.top - from.top }
}
