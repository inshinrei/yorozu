# @yorozu/db-idb

IndexedDB driver for `@yorozu/db`.

## Setup

```ts
import { createIdbDriver } from "@yorozu/db-idb"
import type { Logger } from "@yorozu/log"

let driver = createIdbDriver({
    dbName: "app", // default: schema.name
    indexedDB, // default: globalThis.indexedDB
    IDBKeyRange, // default: globalThis.IDBKeyRange
    log, // optional Logger; silent default
    deferPut: (name) => name !== "meta",
    autoFlush: true, // opt-in; or { pendingPuts: 32, idleMs: 1000 }
})

let db = await driver.open(schema)
```

Logger is optional. Internally: `makeLog(opts.log ?? makeSilentLog(), "yorozu-db-idb")`.

`deferPut`: when it returns `false` for a collection, `put({ flush: "batch" })` still writes immediately. Default: every collection may batch.

## Musts

- Object store / index names match `CollectionDef` (no extra prefixes).
- Reserved index `"__pk"`: primary-key walk, even if not in `CollectionDef.indexes`.
- `scan(..., { direction: "rev" })` returns the highest keys first; omit = fwd.
- `scan(..., { keysOnly: true })` uses `openKeyCursor`. Never reads `cursor.value`. Omit `ScanHit.value`.
- Prefix TTL: `scan("by-evict", { lt: [cutoff], keysOnly: true })` matches `[storedAt, bytes]` with `storedAt < cutoff` via IDB array keys (`[cutoff] < [cutoff, 0]`).
- `getMany` / `putMany` / `delete` share one IDB transaction.
- `count()` with pending is `store.count()` plus a key probe per pending pk (no `getAllKeys`).
- `getMany` of only-pending keys skips `IDBDatabase.transaction`. Duplicate keys share one `get`.
- `scan({ limit })` keeps an early-stop cursor when pending exists (skip pending PKs, then merge).
- Default `put` flush is `"now"`. `"batch"` buffers until `db.flush()` or the next `"rw"` transact commit, not `"r"`. `flush()` coalesces by `(collection, pk)` in one multi-store `readwrite` tx.
- `flush({ reason, signal })`: already-aborted `signal` rejects with `AbortError` (or `signal.reason`) before taking the lock; in-flight writes finish. Read transact `flush` stays a no-op.
- Opt-in `autoFlush`: omitted = off. `true` → `{ pendingPuts: 32, idleMs: 1000 }`. After batch puts, idle-flush via `requestIdle` with `{ reason: "idle" }`; at `pendingPuts` distinct pks, re-arm with timeout 0. Successful flush / close cancels the idle handle. Keep files/avatars immediate via host `deferPut` — default is still every collection may batch.
- Nested `transact` throws. Concurrent `transact` serializes on a mutex (tx facade; nested `transact` rejects without taking the lock).
- Call `await db.flush()` before `close()`. Do not leave `{ flush: "batch" }` puts outstanding across multi-tab upgrades (`onversionchange` closes the connection without flushing).
- `drop(schema)` closes tracked connections and `indexedDB.deleteDatabase`.
