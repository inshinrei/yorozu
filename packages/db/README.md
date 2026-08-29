# @yorozu/db

Injectable collection store (`Collection` / `Db` / `DbDriver`) plus `openMemoryDb`.

## Implementing a driver

Public types must never mention IndexedDB or SQLite. Drivers live in other packages.

Musts:

- Reserved index `"__pk"`: primary-key walk in key order, even if it is not in `CollectionDef.indexes`.
- `scan(..., { keysOnly: true })` must not materialize row values. Omit `ScanHit.value` entirely. Do not clone blobs.
- Bounds use `compareIndexKey`: number < string < array. A shorter prefix-equal array is less (`[cutoff] < [cutoff, 0]`). Prefix TTL: `scan("by-evict", { lt: [cutoff], keysOnly: true })` matches `[storedAt, bytes]` with `storedAt < cutoff`.
- `getMany` preserves input key order; missing keys are `null`.
- Default `put` flush is `"now"`. `"batch"` buffers until `db.flush()` or the next `transact` commit. Memory treats `"batch"` as `"now"`; `flush()` still resolves as a no-op.
- Nested `transact` throws. Concurrent `transact` on overlapping names serializes.
- Unknown collection / unknown index throws.
- Primary keys are strings (`String(...)`). Index `keyPath` is top-level field names only (including compound arrays), not dotted paths.
