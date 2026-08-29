# @yorozu/db-sqlite

better-sqlite3 thin wrapper + driver for `@yorozu/db`. Node-only.

## Setup

```ts
import { createSqliteDriver, wrapBetterSqlite3 } from "@yorozu/db-sqlite"
import type { Logger } from "@yorozu/log"

let driver = createSqliteDriver({
    filename: "app.sqlite",
    // native, // inject better-sqlite3 ctor (tests). Default: better-sqlite3
    log, // optional Logger; silent default
})

let db = await driver.open(schema)
```

Logger is optional. Internally: `makeLog(opts.log ?? makeSilentLog(), "yorozu-db-sqlite")`.

`wrapBetterSqlite3(db)` is the thin handle: `exec`, `prepare` → `{ run, all, get }` with array bind `stmt.run(...params)`, `transaction(fn) => db.transaction(fn)()`, `close`.

## Musts

- `new Native(filename)` then `PRAGMA journal_mode = WAL` (ignore failure on `:memory:`) then wrap, then apply schema.
- One table per collection: `pk TEXT PRIMARY KEY`, `payload TEXT` (JSON minus blob fields), plus `"<index>__<i>"` columns (TEXT/REAL). Sidecar `"<collection>__blobs"` `(pk, field, data BLOB)`.
- `get` rehydrates `Blob` when `Blob` exists, otherwise `Uint8Array`.
- Reserved index `"__pk"`: primary-key walk, even if not in `CollectionDef.indexes`.
- `scan(..., { keysOnly: true })` is `SELECT pk, index columns` only. Never `payload`, never join `__blobs`. Omit `ScanHit.value`.
- Prefix TTL: `scan("by-evict", { lt: [cutoff], keysOnly: true })` matches `[storedAt, bytes]` with `storedAt < cutoff` (`[cutoff] < [cutoff, 0]`).
- Default `put` flush is `"now"`. `"batch"` buffers until `db.flush()` or the next `transact` commit. `flush()` coalesces by `(collection, pk)`. Sync put batches use better-sqlite3 `db.transaction`.
- Async `transact`: mutex + `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. Not `db.transaction(fn)` (that API is sync-only). Nested `transact` throws via a facade. Concurrent `transact` serializes.
- Collection / index names must match `/^[A-Za-z0-9_-]+$/` and are quoted as `"name"`. Illegal names throw.
- `drop(schema)` closes tracked connections and `fs.unlink`s the file unless `filename === ":memory:"`.
