import type { SortableSession } from "./session"

export function paintSortableTransforms(
    session: SortableSession,
    nodes: ReadonlyMap<string | number, HTMLElement>,
    opts?: { reduced?: boolean },
): void {
    let reduced = opts?.reduced === true
    let axis = session.axis
    for (let [key, node] of nodes) {
        let offset = session.getOffset(key)
        let dragging = key === session.draggingKey
        let lift = dragging && !reduced ? session.liftScale : 1
        let x = axis === "x" ? offset : 0
        let y = axis === "y" ? offset : 0
        node.style.transform = `translate3d(${x}px, ${y}px, 0px) scale(${lift})`
        node.style.transition = dragging || reduced ? "none" : session.siblingTransition
    }
}
