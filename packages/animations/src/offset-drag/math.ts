export type DragAxis = "none" | "horizontal" | "vertical"

export const DRAG_LOCK_PX: number = 10
export const DRAG_LOCK_RATIO: number = 1.5

export function resolveDragAxis(
    current: DragAxis,
    offsetX: number,
    offsetY: number,
    lockPx: number = DRAG_LOCK_PX,
    lockRatio: number = DRAG_LOCK_RATIO,
): DragAxis {
    if (current !== "none") return current
    let absX = Math.abs(offsetX)
    let absY = Math.abs(offsetY)
    if (absX === 0 && absY === 0) return "none"

    let preferHorizontal = absX > lockPx || (absY > 0 && absX / absY > lockRatio)
    let preferVertical = absY > lockPx || (absX > 0 && absY / absX > lockRatio)

    if (preferHorizontal && (!preferVertical || absX >= absY)) return "horizontal"
    if (preferVertical) return "vertical"
    return "none"
}

export function projectDragOffset(axis: DragAxis, offsetX: number, offsetY: number): { x: number; y: number } {
    if (axis === "horizontal") return { x: offsetX, y: 0 }
    if (axis === "vertical") return { x: 0, y: offsetY }
    return { x: 0, y: 0 }
}
