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
    canAnimate,
    resolveViewSlideMode,
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

## Intensity

Three playback levels. The OS `prefers-reduced-motion` query is **seed only** — after the host stores a pick, that value owns playback.

| Level  | Meaning                      |
| ------ | ---------------------------- |
| `low`  | no motion (instant switches) |
| `med`  | softer transitions           |
| `high` | full transitions             |

```ts
import { defaultAnimationLevel, canAnimate, resolveViewSlideMode, prefersReducedMotion } from "@yorozu/animations"

let level = stored ?? defaultAnimationLevel(prefersReducedMotion())
// first-run seed: med when the OS asks for reduce, otherwise high

resolveViewSlideMode(level, "stack") // none | crossfade | push
resolveViewSlideMode(level, "layer") // none | crossfade | cover
canAnimate(level) // false only for low
```

`pickAnimationLevelFromRatio` / `stepAnimationLevel` / `cycleAnimationLevel` drive a three-stop slider. `prefersReducedMotion()` stays an honest media-query probe.

## View slide

Panel stack transitions driven by an active key. Built-in modes: `push` (full-width), `crossfade` (±1.5rem + opacity), `cover` (scale-out leave + 200% enter), `peek` (~20% back + dim), `lift` (vertical ±100%), `zoom` (scale 1.1 / 0.95), `reveal` (`clip-path` inset wipe), `none`.

```ts
import { createViewSlide, slideDirectionByIndex, resolveViewSlideMode } from "@yorozu/animations"

const items = [{ id: "a" }, { id: "b" }, { id: "c" }]
const slide = createViewSlide({
    getMode: () => resolveViewSlideMode(level, "stack"),
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
    // Optional: FLIP a key from a host-supplied overlay translateY (skips classify).
    getFromTranslateY: (key) => overlayByKey.get(key),
})

// Per mounted row:
const handle = reorder.register(rowEl, item.id)
// After the order changes:
reorder.sync(items)
// One-shot map wins for that sync over getFromTranslateY for keys it has:
reorder.sync(items, { fromTranslateY: new Map([[droppedKey, px]]) })
// handle.destroy() when the row leaves the window
```

Host computes `px`; the package does not measure layout. `px` is CSS `translateY` — positive is down from the post-layout slot. Override plays only when `|px| > LIST_REORDER_EPSILON_PX`. Use `isSuppressed` during an active drag so baseline advances without FLIP.

Classifier helpers `buildOrderDiff` and `classifyReorderAnim` are public if the host needs the same majority/minority rules outside the controller.

## Motion catalog

| Name              | API                                     | Notes                                                |
| ----------------- | --------------------------------------- | ---------------------------------------------------- |
| Intensity         | `AnimationLevel`                        | `low` / `med` / `high`; OS seed-only                 |
| Stack slide       | `createViewSlide` `push`                | Full-width 100% translate                            |
| Soft slide        | `createViewSlide` `crossfade`           | ±1.5rem + opacity                                    |
| Cover slide       | `createViewSlide` `cover`               | Scale-out leave + 200% enter (list-layer open/close) |
| Peek slide        | `createViewSlide` `peek`                | Incoming full-width; outgoing ~20% back + dim        |
| Lift              | `createViewSlide` `lift`                | Vertical `translateY` ±100%                          |
| Zoom              | `createViewSlide` `zoom`                | Scale 1.1 / 0.95 + short opacity                     |
| Reveal            | `createViewSlide` `reveal`              | `clip-path` inset wipe                               |
| Shared element    | `createSharedElement`                   | Thumb ↔ stage flight                                 |
| Sliding indicator | `createSlidingIndicator`                | Size snap, position tween                            |
| List reorder      | `createListReorder`                     | Index FLIP, fixed height                             |
| Dock              | `createDock`                            | Edge open/close + backdrop fade                      |
| Fade              | `createFade`                            | Opacity-only show/hide                               |
| Popover           | `createPopover`                         | Scale + fade from an origin                          |
| Digit flip        | `buildDigitSlots` / `playDigitFlip`     | Right-aligned slots + `rotateX`                      |
| Presence pop      | `shouldPresencePop` / `playPresencePop` | Scale-in only on 0 → N                               |
| Send flight       | `playSendFlight`                        | Clone from an origin to a list insert                |
| Swipe reveal      | `createSwipeReveal`                     | Pointer rubber + release tween                       |
| Scroll tween      | `playScrollTween`                       | Animate `scrollLeft` / `scrollTop`                   |
| Ripple            | `playRipple`                            | Touch ink at pointer                                 |
| Pinch zoom        | `createPinchZoom`                       | Clamp / origin zoom; pan when scale > 1              |
| Waveform          | `decodeWaveform` / `fitWaveform`        | Packed 5-bit samples, resampled bars                 |
| Spoiler           | `createSpoiler`                         | Dot-field overlay; reveal fades it out               |

## Reduced motion

Respect user preference and host suppressors:

- **`prefersReducedMotion()`** — reads `(prefers-reduced-motion: reduce)`. Use it only to **seed** `defaultAnimationLevel`. Stored `low` / `med` / `high` owns playback after that.
- **`canAnimate(level)`** — false only for `low`.
- **View slide `mode: "none"`** — skips animation; active key still updates and mount policy still applies.
- **List reorder `isReduced`** — clears the order baseline (no FLIP).
- **List reorder `isSuppressed`** — updates the baseline without animating (useful during drag).
- **Sliding indicator `enabled`** — when false, snaps transform without WAAPI.

Wire `getMode`, `isReduced`, and `enabled` from the stored intensity so every primitive stays consistent.

## Performance notes

- **Compositor-only:** prefer `transform` / `opacity`; avoid animating layout properties.
- **Index FLIP:** list reorder uses order indices × fixed height, not layout measurement, so it stays safe for virtualized windows.
- **Cancel before retarget:** controllers cancel in-flight WAAPI before starting a new run; call `cancel` / `destroy` when unmounting hosts to avoid leaked animations and clones.
- **`dualRaf`:** exported for hosts that need two animation frames before measuring or starting motion after a paint.
- **First layout is a baseline:** first indicator measure and first reorder `sync` establish state without animating.
