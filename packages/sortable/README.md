# @yorozu/sortable

Framework-free pointer session for reordering a full array while only some item nodes are registered. You own the DOM, paint offsets yourself, and decide when drag is armed; this package tracks insert index, sibling shifts, and edge auto-scroll.

## Install

```bash
pnpm add @yorozu/sortable
```

## Session

```ts
import {
    createSortableSession,
    paintSortableTransforms,
    POINTER_ACTIVATION,
    type SortableSession,
} from "@yorozu/sortable"

let items = ["a", "b", "c"]
let nodes = new Map<string, HTMLElement>()

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
    nodes.set(key, node)
    node.addEventListener("pointerdown", (e) => session.pointerDown(key, e))
    // later: handle.update(newKey) / handle.destroy(); nodes.delete(key)
}

function paint(): void {
    // Optional { reduced: true } overrides lift/transition per call when the host
    // did not pass reducedMotion on the session.
    paintSortableTransforms(session, nodes)
    // Overlay (if any) still uses session.getOverlayOffset() separately.
}
```

## Wrapping flow

For a wrapping flex / chip strip (items reflow in 2d, not a fixed grid), use `createSortableBothAxis` and `paintSortableFlowTransforms`. Offsets are `{x, y}` from `session.getOffset(key)`.

```ts
import {
    createSortableBothAxis,
    paintSortableFlowTransforms,
    HOLD_ACTIVATION,
    type SortableBothAxis,
} from "@yorozu/sortable"

let items = ["a", "b", "c", "d"]
let nodes = new Map<string, HTMLElement>()

let session: SortableBothAxis = createSortableBothAxis({
    getItems: () => items,
    getKey: (item) => item,
    // HOLD_ACTIVATION when the wrapping strip itself scrolls so a press can scroll
    // without starting a drag.
    activation: HOLD_ACTIVATION,
    onReorder: (next) => {
        items = next
        render()
    },
})

session.subscribe(() => paint())

function bindChip(node: HTMLElement, key: string): void {
    let handle = session.registerItem(node, key)
    nodes.set(key, node)
    node.addEventListener("pointerdown", (e) => session.pointerDown(key, e))
    // later: handle.update(newKey) / handle.destroy(); nodes.delete(key)
}

function paint(): void {
    paintSortableFlowTransforms(session, nodes)
    // Overlay (if any) still uses session.getOverlayOffset() separately.
}
```

## Activation

| Token                | `delayMs` | When to use                                                                                                                |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POINTER_ACTIVATION` | `0`       | Default. Drag starts after `moveThresholdPx` (10) along the session axis.                                                  |
| `HOLD_ACTIVATION`    | `200`     | Press-and-hold. Move more than `delayFailPx` (4, euclidean) before the timer aborts pending so the strip can still scroll. |

Pass `activation` on `createSortableSession`. `pointerDown` is the threshold / hold path; `activate(key, clientX, clientY)` arms immediately without waiting for DOM move events. Optional `canDragKey` is checked on `pointerDown`, `activate`, and again when the drag becomes active.

## Auto-scroll

While dragging, the session scrolls the nearest overflow parent (or `getViewport()`) when the pointer enters a **60px** edge zone on **both axes** (`AUTO_SCROLL_ZONE_PX`). Step size is quadratic in penetration, capped at **8px per frame** (`AUTO_SCROLL_MAX_PX_PER_FRAME`).

- Viewport: `getViewport()` override, else `findScrollParent` from a registered node (overflow `auto` / `scroll` / `overlay` and content overflowing on that axis).
- Scroll-max is frozen at drag begin so a lifted transform cannot grow the range.
- Math helpers `computeAutoScrollDelta` / `computeAutoScrollDeltaX` / `computeAutoScrollDelta1d` are exported for hosts that drive their own loop.
- `createSortableAutoScroll` is exported for hosts that drive a gesture without a session (the session still constructs it internally). Hosts may pass `maxStep: 18` (or `autoScrollMaxPxPerFrame: 18`) to keep the old cap.
- Optional `onAutoScroll(delta, viewport)` runs after each applied write so a virtual list can expand its mounted window. Session option of the same name is forwarded.

## Virtual lists

`getItems` always returns the **full** ordered array. Only visible rows need `registerItem`. Missing nodes are filled with `estimateAxisSnapshots` using `getItemSize` (or a measured size from registered nodes) so insert index and sibling shifts stay correct across unmounted keys. `onReorder` still receives the full reordered array.

## Host adapter

The session does not paint unless the host calls `paintSortableTransforms(session, nodes)`. That helper writes only `transform` / `transition` from `getOffset` (pointer delta + scroll delta for the active row; ± one item for siblings between source and insert). Pass `{ reduced: true }` to force scale `1` and transition `"none"` per call when the host did not wire `reducedMotion` on the session. Viewport-fixed overlays should use `getOverlayOffset()` (pointer delta only).

Pass `reducedMotion: () => boolean` (stored product level, not OS MQ). `session.liftScale` is `1` and `session.siblingTransition` is `"none"` while that callback is true. Optional `feel` merges over `SORTABLE_FEEL`.

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
- No grid occupancy (tetris). Wrapping flex flow is `createSortableBothAxis`; 1d lists stay on `createSortableSession`.
- No multi-item drag
- No domain order logic (hosts own persistence and constraints)
