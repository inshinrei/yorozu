# E2E gaps

Playwright covers Must scenarios for `@yorozu/confirm-tooltip`, `@yorozu/context-menu`, `@yorozu/media-viewer`, `@yorozu/sortable`, and `@yorozu/virtual-list`. This file records product features the packages do not have (do not test as if they exist) and Should scenarios not landed in this pass.

## Product gaps

- Sortable: no keyboard reorder and no package-level Escape (host would have to listen).
- Confirm: `listenEsc` defaults to false; Escape-on-by-default is not a package behavior.
- Media: no tap-to-toggle chrome, no double-tap zoom, no video zoom.
- Menu: no close-on-select package default, no typeahead, no ArrowLeft/Right submenu.
- Virtual list: no `scrollToIndex` engine API.

## Deferred e2e

- Confirm: working lock (`canClose` false).
- Confirm: history-back dismiss.
- Confirm: clamp with no flip.
- Menu: ArrowUp/Down skips disabled items.
- Menu: `listenEsc: false` keeps the menu open on Escape.
- Menu: viewport flip near edges.
- Media: zoom locks swipe (arrows are covered).
- Media: keys ignored in chrome `<input>` except Escape.
- Sortable: `pointercancel` restores order and transforms.
- Sortable: HOLD vs scroll (Nice; needs overflow + 200ms still press).
- Virtual list: keyboard PageDown/Home/End on a focused scroller.
- Harness nit: context-menu `waitMs` duplication; K3/K4 wall-clock waits.
- Harness nit: media V9 40px center slack on a short strip; duplicated wait helpers.
- Harness nit: sortable `mount1d` / `mountBoth` duplicated pointer bind loop.
