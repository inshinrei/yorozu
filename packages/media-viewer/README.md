# @yorozu/media-viewer

Framework-agnostic media gallery overlay: session, gestures, zoom, ghost flight, and chrome slots. You own chrome DOM; this package paints the stage and drives pointers.

## Install

```bash
pnpm add @yorozu/media-viewer
```

## Zoom

Chrome reads `percentLabel()` / `scale()` and subscribes with `onZoomChange`. Do not run a perpetual overlay `requestAnimationFrame` to poll zoom. `formatZoomPercent` is the percent formatter.

```ts
chromeApi.onZoomChange(() => {
    label.textContent = chromeApi.percentLabel()
})
```

Idle 100% view does not hold an animation-frame pump. Settle lerps through `@yorozu/animations` `onAnimationFrame` and unsubscribes at rest.

## Decode

Omit `decode` to keep today's `<img src>` / poster path. Attach does not call the port.

When `decode` is set, neighbor peeks, the active image, and painted thumbs wait on a budgeted abortable port (`createMediaDecodePort`) and then `applyCanvasImageSource`. Video active panes still use `<video src>`. The package does not decode the full album on open — only the active image, neighbor peeks, and painted thumbs.

Default budget: 1 active, 2 peeks (older and newer share), 4 thumbs. The host supplies `decode` (for example a `createBitmapWorkQueue` wrapper).

While a swipe is gesturing, settling, or dismissing, attach calls `pausePeeksAndThumbs` so new peek and thumb jobs do not start. Active-pane decode may continue. After settle, attach `resume()`s and requests the landed peek neighbors. Zoom drag is not a gesture.

Hosts that warm their own bitmaps should `pause()` that work while `viewer.isGesturing()` is true (chrome `api.isGesturing()` reads the same flag). `setGesturing` does not notify session `subscribe`.
