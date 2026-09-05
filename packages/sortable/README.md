# @yorozu/sortable

Framework-free pointer session for reordering a full array while only some item nodes are registered. You own the DOM, paint offsets yourself, and decide when drag is armed; this package tracks insert index, sibling shifts, and edge auto-scroll.

## Install

```bash
pnpm add @yorozu/sortable
```

## Session

```ts
import { createSortableSession, POINTER_ACTIVATION, SORTABLE_FEEL, type SortableSession } from "@yorozu/sortable"

let items = ["a", "b", "c"]

let session: SortableSession = createSortableSession({
    axis: "y",
    getItems: () => items,
    getKey: (item) => item,
    activation: POINTER_ACTIVATION,
    onReorder: (next) => {
        items = next
        render()
    },
})

session.subscribe(() => paint())

function bindRow(node: HTMLElement, key: string): void {
    let handle = session.registerItem(node, key)
    node.addEventListener("pointerdown", (e) => session.pointerDown(key, e))
    // later: handle.update(newKey) / handle.destroy()
}

function paint(): void {
    for (let key of items) {
        let node = document.querySelector(`[data-key="${key}"]`) as HTMLElement | null
        if (!node) continue
        let offset = session.getOffset(key)
        let scale = key === session.draggingKey ? session.liftScale : 1
        node.style.transform = `translateY(${offset}px) scale(${scale})`
        node.style.transition =
            key === session.draggingKey ? "none" : `transform ${SORTABLE_FEEL.siblingMs}ms ${SORTABLE_FEEL.siblingEase}`
    }
}
```

## Activation

| Token                | `delayMs` | When to use                                                                                                                |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POINTER_ACTIVATION` | `0`       | Default. Drag starts after `moveThresholdPx` (10) along the session axis.                                                  |
| `HOLD_ACTIVATION`    | `200`     | Press-and-hold. Move more than `delayFailPx` (4, euclidean) before the timer aborts pending so the strip can still scroll. |

Pass `activation` on `createSortableSession`. `pointerDown` is the threshold / hold path; `activate(key, clientX, clientY)` arms immediately without waiting for DOM move events. Optional `canDragKey` is checked on `pointerDown`, `activate`, and again when the drag becomes active.

## Auto-scroll

While dragging, the session scrolls the nearest overflow parent (or `getViewport()`) when the pointer enters a **60px** edge zone on **both axes** (`AUTO_SCROLL_ZONE_PX`). Step size is quadratic in penetration, capped at **18px per frame** (`AUTO_SCROLL_MAX_PX_PER_FRAME`).

- Viewport: `getViewport()` override, else `findScrollParent` from a registered node (overflow `auto` / `scroll` / `overlay` and content overflowing on that axis).
- Scroll-max is frozen at drag begin so a lifted transform cannot grow the range.
- Math helpers `computeAutoScrollDelta` / `computeAutoScrollDeltaX` / `computeAutoScrollDelta1d` are exported for hosts that drive their own loop.

## Virtual lists

`getItems` always returns the **full** ordered array. Only visible rows need `registerItem`. Missing nodes are filled with `estimateAxisSnapshots` using `getItemSize` (or a measured size from registered nodes) so insert index and sibling shifts stay correct across unmounted keys. `onReorder` still receives the full reordered array.

## Host adapter

The session does not paint. Apply `getOffset(key)` (pointer delta + scroll delta for the active row; ± one item for siblings between source and insert) yourself. Viewport-fixed overlays should use `getOverlayOffset()` (pointer delta only).

For reduced motion, keep reading `session.liftScale` / `SORTABLE_FEEL` as authored and map in the host: set lift scale to `1` and sibling transition to `"none"` when the user prefers reduced motion.

## Reorder mode

`createReorderMode()` is a pure enter/exit flag with `isActive` and `subscribe`. It is not a gesture recognizer — hosts decide when drag is armed and call `enter` / `exit`. Idempotent: repeating the same state does not notify again.

```ts
import { createReorderMode } from "@yorozu/sortable"

let mode = createReorderMode()
mode.subscribe(() => renderChrome(mode.isActive))
mode.enter()
mode.exit()
```

## Non-goals

- Not a general drag-and-drop toolkit
- No nested sortables
- No 2d grid reordering
- No multi-item drag
- No domain order logic (hosts own persistence and constraints)
