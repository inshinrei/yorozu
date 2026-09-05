import { readAxisSnapshot, type AxisSnapshot, type SortableAxis } from "./geometry"

export function estimateAxisSnapshots(args: {
    keys: Array<string | number>
    itemEls: ReadonlyMap<string | number, HTMLElement>
    axis: SortableAxis
    itemSize: number
    originStart: number
}): AxisSnapshot[] {
    let { keys, itemEls, axis, itemSize, originStart } = args
    let out: AxisSnapshot[] = []
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i]!
        let el = itemEls.get(key)
        if (el) {
            out.push(readAxisSnapshot(el, axis, key))
            continue
        }
        let start = originStart + i * itemSize
        out.push({
            key,
            start,
            end: start + itemSize,
            size: itemSize,
            mid: start + itemSize / 2,
        })
    }
    return out
}
