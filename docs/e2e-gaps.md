# E2E gaps

Playwright covers Must and Should scenarios for `@yorozu/confirm-tooltip`, `@yorozu/context-menu`, `@yorozu/media-viewer`, `@yorozu/sortable`, and `@yorozu/virtual-list`. This file records product features the packages do not have (do not test as if they exist).

## Product gaps

- Sortable: no keyboard reorder and no package-level Escape (host would have to listen).
- Confirm: `listenEsc` defaults to false; Escape-on-by-default is not a package behavior.
- Media: no double-tap zoom, no video zoom.
- Menu: no close-on-select package default, no typeahead, no ArrowLeft/Right submenu.
