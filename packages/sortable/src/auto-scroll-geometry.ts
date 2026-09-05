export type ViewportRect = { top: number; bottom: number }
export type EdgeRange = { start: number; end: number }

export function computeAutoScrollDelta1d(pointer: number, range: EdgeRange, zone: number, maxStep: number): number {
    let span = range.end - range.start
    if (span < 5) return 0
    let startDist = pointer - range.start
    let endDist = range.end - pointer
    if (startDist > 0 && startDist < zone) {
        let closeness = (zone - startDist) / zone
        return -maxStep * closeness * closeness
    }
    if (endDist > 0 && endDist < zone) {
        let closeness = (zone - endDist) / zone
        return maxStep * closeness * closeness
    }
    return 0
}

export function computeAutoScrollDelta(pointerY: number, rect: ViewportRect, zone: number, maxStep: number): number {
    return computeAutoScrollDelta1d(pointerY, { start: rect.top, end: rect.bottom }, zone, maxStep)
}

export function computeAutoScrollDeltaX(
    pointerX: number,
    rect: { left: number; right: number },
    zone: number,
    maxStep: number,
): number {
    return computeAutoScrollDelta1d(pointerX, { start: rect.left, end: rect.right }, zone, maxStep)
}
