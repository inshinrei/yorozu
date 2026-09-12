# @yorozu/virtual-list

Framework-free id-window engine for absolute-row lists. You own the DOM: paint `top` from `rowTop`, size the sizer from `totalSize`, and iterate `viewportIds`. This package does not render, does not run FLIP, and does not own sortable.

## Install

```bash
pnpm add @yorozu/virtual-list
```

## Slice + factory

Use `createVirtualList` from a scroll handler. Number `itemSize` is O(1). Pass a function for two-height rows; the engine rebuilds a prefix on `sync` and lower-bounds it on scroll.

`onVisibleRange` is the mounted window. `onPaintedRange` is the rows intersecting the viewport (use this for presence / warm). Edge growth is math-only. Idle trim recenters to ~2× `listSlice` after `DEFAULT_IDLE_TRIM_MS` (150). `listSliceForViewport` is applied on idle, not mid-fling.

Pass `getFromTranslateY` through to `@yorozu/animations` `createListReorder`. Snap `itemSize` during a density tween; do not feed fractional height into `rowTop` until settle.

`slotIndex` is a stable integer for a mounted id so a host can rebind a row without remounting. The engine does not pool components.

History / variable-height bubbles are out of scope. Do not translate the window (`offsetY`). Absolute `top` is the layout.

```ts
import { createVirtualList } from "@yorozu/virtual-list"

let items = Array.from({ length: 1000 }, (_, i) => `row-${i}`)
let scroller = document.getElementById("scroller")!
let sizer = document.getElementById("sizer")!
let rowNodes = new Map<string, HTMLElement>()

let list = createVirtualList({
    getItems: () => items,
    itemSize: 48,
    onChange: () => paint(),
})

list.sync()

scroller.addEventListener("scroll", () => {
    list.onScroll({
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
    })
})

function paint(): void {
    sizer.style.height = `${list.totalSize()}px`
    let from = list.fromOffset()
    let ids = list.viewportIds() ?? []
    for (let i = 0; i < ids.length; i++) {
        let id = ids[i]!
        let node = rowNodes.get(id)
        if (node === undefined) continue
        node.style.top = `${list.rowTop(from + i)}px`
    }
}
```
