import type { SortableBothAxis } from "./both-axis"

export function paintSortableFlowTransforms(
    session: SortableBothAxis,
    nodes: ReadonlyMap<string | number, HTMLElement>,
    opts?: { reduced?: boolean },
): void {
    let reduced = opts?.reduced === true
    for (let [key, node] of nodes) {
        let offset = session.getOffset(key)
        let dragging = key === session.draggingKey
        let lift = dragging && !reduced ? session.liftScale : 1
        node.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0px) scale(${lift})`
        node.style.transition = dragging || reduced ? "none" : session.siblingTransition
    }
}
