# @yorozu/media-viewer

Framework-agnostic media gallery overlay: session, gestures, zoom, ghost flight, and chrome slots. You own chrome DOM; this package paints the stage and drives pointers.

## Install

```bash
pnpm add @yorozu/media-viewer
```

## Zoom

Chrome reads `percentLabel()` / `scale()` and subscribes with `onZoomChange`. Do not run a perpetual overlay `requestAnimationFrame` to poll zoom. `formatZoomPercent` is the percent formatter.

```ts
return chromeApi.onZoomChange(() => {
    label.textContent = chromeApi.percentLabel()
})
```

Idle 100% view does not hold an animation-frame pump. Settle lerps through `@yorozu/animations` `onAnimationFrame` and unsubscribes at rest.

## Gif

`kind: "gif"` paints an `<img data-yorozu-media-stage>` (not `<video>`). It is not zoom-as-photo: pinch, wheel-zoom, and chrome `zoomIn` apply only to `"image"`. Swipe still navigates. Reduced motion uses `poster` when set, otherwise `src`. Motion on uses `src` (the browser loops the GIF). When `decode` is set, the active gif uses the same port path as an image (`role: "active"`). Neighbor peeks use `src` / decode like images.

## Decode

Omit `decode` to keep today's `<img src>` / poster path. Attach does not call the port.

When `decode` is set, neighbor peeks, the active image, and painted thumbs wait on a budgeted abortable port (`createMediaDecodePort`) and then `applyCanvasImageSource`. `applyCanvasImageSource` **adopts** a returned `HTMLImageElement` (moves it in the DOM). Hosts must not reuse one node for active + peek. Video active panes still use `<video src>`. The package does not decode the full album on open — only the active image, neighbor peeks, and painted thumbs.

Default budget: 1 active, 2 peeks (older and newer share), 4 thumbs. The host supplies `decode` (for example a `createBitmapWorkQueue` wrapper).

While a swipe is gesturing, settling, or dismissing, attach calls `pausePeeksAndThumbs` so new peek and thumb jobs do not start. Active-pane decode may continue. After settle, attach `resume()`s and requests the landed peek neighbors. Zoom drag is not a gesture.

Hosts that warm their own bitmaps should `pause()` that work while `viewer.isGesturing()` is true (chrome `api.isGesturing()` reads the same flag). `setGesturing` does not notify session `subscribe`.

## Visible

`onVisible` is a host port. The package does not warm bitmaps and does not call `decode` from it.

Attach emits `{ stage, peeks, thumbs }` after overlay paint: open, index change, neighbor change, virtualized strip window shift, and swipe settle. Close / overlay teardown emits `{ stage: "", peeks: [], thumbs: [] }`. Session `open` / `next` / `setNeighbors` / `setItems` do not fire it. Identical structs are coalesced. Hosts can abort warm on the empty set.

- `stage` — current item id, or `""` if none
- `peeks` — older then newer neighbor ids that exist
- `thumbs` — painted filmstrip ids (`list.viewportIds()` when virtualized, all item ids when the strip is on, else `[]`)

Map `stage` to `pri: "visible"` and peeks/thumbs to `"preload"`. Abort ids that left the set.

## Ghost

`createMediaGhost` keeps one dest-sized clone (`cloneCount()` is 1 in flight, else 0). `maxClones` is accepted and ignored. Attach passes the active pane's `[data-yorozu-media-stage]` image or canvas (or an img/canvas in that pane) as `bitmap` so the flight skips the origin URL. Neighbor peeks are not used. Do not `cloneNode` the live stage.

## Filmstrip

`filmstrip: false` turns the package strip off. `true` or omit paints today's full in-flow strip. `{ virtualize: true }` windows thumbs with `@yorozu/virtual-list` using absolute `left` (not a `translateX` window). Virtualized current thumbs stay the same size as the rest.

Host either virtualizes the package strip **or** keeps `filmstrip: false` and virtualizes its own strip — not both.

`filmstripThumbSrc` defaults to `poster ?? src`.
