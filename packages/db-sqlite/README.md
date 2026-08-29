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
- Default `put` flush is `"now"`. `"batch"` buffers until `db.flush()` or the next `"rw"` transact commit, not `"r"`. `flush()` coalesces by `(collection, pk)`. Sync put batches use better-sqlite3 `db.transaction`.
- Async `transact`: mutex + `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. Not `db.transaction(fn)` (that API is sync-only). Nested `transact` throws via a facade. Concurrent `transact` serializes. Prefer the callback's `db.collection()`. A collection obtained before `transact` is reentrant while the SQL tx is open and joins that tx (rolls back with it). Concurrent ops from another task still queue on the mutex.
- Scan `limit` is applied after `inRange` + `compareIndexKey` sort (no SQL `LIMIT`). String / mixed index keys are not filtered by SQL `WHERE` (SQLite TEXT is UTF-8; `IndexKey` strings compare as UTF-16). Select covering columns, then `inRange` / `compareIndexKey`.
- Call `await db.flush()` before `close()`. Do not leave `{ flush: "batch" }` puts outstanding if another process may take the file.
- Collection / index names must match `/^[A-Za-z0-9_-]+$/` and are quoted as `"name"`. Illegal names throw.
- `drop(schema)` closes tracked connections and `fs.unlink`s the file unless `filename === ":memory:"`.
