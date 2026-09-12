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
