# @yorozu/log-persist

Queryable rotating log store for `@yorozu/log`. Persistence is an injected `@yorozu/db` `Db`. This package does not open IndexedDB or SQLite; the host supplies a driver opened with `logPersistSchema` (or a schema that includes that collection unchanged).

## Setup

```ts
import { configure } from "@yorozu/log"
import { logPersistSchema, openLogStore } from "@yorozu/log-persist"
import { createIdbDriver } from "@yorozu/db-idb"

let db = await createIdbDriver({ dbName: "app-logs" }).open(logPersistSchema)
let store = openLogStore(db)
configure({ level: "info", handlers: [store.handler] })
```

SQLite is the same with `createSqliteDriver({ filename })`.

Do not attach this handler to a logger used by the same Db driver — driver errors would re-enter the store (loop). For a driver used only to store logs, omit `log` or pass `disabled`. This package does not call `init` / `configure`.

The handler is sync (`void` append). Await `store.flush()` before `query` / `rotate` if you need in-flight writes visible.

## Query

```ts
await store.flush()
await store.query({ subsystem: "outbox" })
await store.query({ subsystem: "outbox", category: "worker" })
await store.query({ level: "error" })
await store.query({ level: ["error", "fault"] })
await store.query({ since: Date.now() - 60_000, until: Date.now(), limit: 50, direction: "rev" })
```

Index: subsystem + category → `by-subsystem-category`; subsystem only → `by-subsystem`; otherwise `by-time`. `since` / `until` are `timestamp >= since` and `timestamp < until`. `level` and category-without-subsystem are filtered in memory after the scan; `limit` applies after those filters. Omit `direction` (or `"fwd"`) for oldest first; `"rev"` is newest first.

## Rotation

After every `rotateEvery` successful appends (default 32), and from `store.rotate()`:

1. Delete rows with `timestamp < now - maxAgeMs` (`by-time`, `keysOnly`).
2. If `count() > maxCount`, delete oldest until `count() === maxCount`.

Defaults: `maxCount: 10_000`, `maxAgeMs: 7 days`, `rotateEvery: 32`. `rotateEvery <= 0` rotates on every append. Pass `clock: { now }` to control age cutoffs; record timestamps stay whatever the logger stamped.

`store.clear()` empties the collection.
