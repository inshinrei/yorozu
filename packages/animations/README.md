# @yorozu/animations

Framework-agnostic compositor motion primitives for the browser.

## Install

```bash
pnpm add @yorozu/animations
```

Import from the package root:

```ts
import {
  createSharedElement,
  playSharedElement,
  createViewSlide,
  createSlidingIndicator,
  createListReorder,
  prefersReducedMotion,
} from "@yorozu/animations"
```

## What it is

Small, host-driven helpers built on the Web Animations API (WAAPI). Motion stays on compositor-friendly properties — primarily `transform` and `opacity` — so frames stay cheap.

The package is framework-agnostic: factories return plain controllers; you own the DOM, measurement timing, and when to call into the API. No framework effects, no layout thrashing inside the helpers.

## Shared element

Use a one-shot flight with `playSharedElement`, or a reusable controller with `createSharedElement` when open/close need to cancel each other.

```ts
import { createSharedElement, type Rect } from "@yorozu/animations"

const se = createSharedElement()
const from: Rect = thumb.getBoundingClientRect()
const to: Rect = stage.getBoundingClientRect()

const playback = se.play({
  host: document.body,
  from,
  to,
  imageUrl: thumb.src,
  hideTarget: stage,
})
// playback?.done is Promise<boolean> — true if finished, false if cancelled
// se.cancel() aborts an in-flight clone
```

`playSharedElement(opts)` is the same one-shot path without a retained controller (still returns `Playback | null`).

`playOpen` / `playClose` accept seeds and viewport insets when the host does not already have both rects. Math helpers (`computeFlight`, `computeOpenFlight`, …) are exported for custom layouts.

## View slide

Panel stack transitions (push / crossfade) driven by an active key:

```ts
import { createViewSlide, slideDirectionByIndex } from "@yorozu/animations"

const items = [{ id: "a" }, { id: "b" }, { id: "c" }]
const slide = createViewSlide({
  getMode: () => "push", // or "crossfade" | "none"
  getDirection: (from, to) => slideDirectionByIndex(from, to, items),
  mountPolicy: "active-plus-leaving", // or "keep-visited"
})

// Render only keys in slide.mountedKeys, then:
const handle = slide.attach(panelEl, key)
slide.setActive(nextKey)
// handle.update(newKey) / handle.destroy() when the node unmounts
```

`setActive` starts the pair animation when both panels are attached. `mountedKeys`, `role`, and `isVisible` drive host rendering. Call `cancel` / `destroy` on teardown.

## Sliding indicator

Track an underline (or similar) under the active control. Size snaps; only position is tweened.

```ts
import { createSlidingIndicator } from "@yorozu/animations"

const indicator = createSlidingIndicator({
  getTrack: () => trackEl,
  getIndicator: () => indicatorEl,
  getActive: () => activeTabEl,
  enabled: () => !prefersReducedMotion(),
})

// After the active item changes (and layout has updated):
indicator.measure()
// ResizeObserver on the track also remeasures
// indicator.destroy() on teardown
```

## List reorder

Index-based FLIP for fixed-height lists. Geometry is `delta = -orderDiff * itemHeight` — no `getBoundingClientRect`.

```ts
import { createListReorder } from "@yorozu/animations"

const reorder = createListReorder<Item>({
  getItemHeight: () => 48,
  getKey: (item) => item.id,
  isEnabled: () => true,
  isReduced: () => prefersReducedMotion(),
  isSuppressed: () => isDragging,
})

// Per mounted row:
const handle = reorder.register(rowEl, item.id)
// After the order changes:
reorder.sync(items)
// handle.destroy() when the row leaves the window
```

Classifier helpers `buildOrderDiff` and `classifyReorderAnim` are public if the host needs the same majority/minority rules outside the controller.

## Reduced motion

Respect user preference and host suppressors:

- **`prefersReducedMotion()`** — reads `(prefers-reduced-motion: reduce)`.
- **View slide `mode: "none"`** — skips animation; active key still updates and mount policy still applies.
- **List reorder `isReduced`** — clears the order baseline (no FLIP).
- **List reorder `isSuppressed`** — updates the baseline without animating (useful during drag).
- **Sliding indicator `enabled`** — when false, snaps transform without WAAPI.

Wire reduced motion into `getMode`, `isReduced`, and `enabled` from the host so every primitive stays consistent.

## Performance notes

- **Compositor-only:** prefer `transform` / `opacity`; avoid animating layout properties.
- **Index FLIP:** list reorder uses order indices × fixed height, not layout measurement, so it stays safe for virtualized windows.
- **Cancel before retarget:** controllers cancel in-flight WAAPI before starting a new run; call `cancel` / `destroy` when unmounting hosts to avoid leaked animations and clones.
- **`dualRaf`:** exported for hosts that need two animation frames before measuring or starting motion after a paint.
- **First layout is a baseline:** first indicator measure and first reorder `sync` establish state without animating.
