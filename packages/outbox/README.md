# @yorozu/outbox

Durable job queue + claim/lease worker. Persistence is an injected `OutboxStore` (memory or `@yorozu/db` Collection). This package does not open IndexedDB or SQLite.

## Setup

```ts
import { openMemoryDb } from "@yorozu/db"
import type { Logger } from "@yorozu/log"
import {
    OutboxWorker,
    createOutboxStore,
    openMemoryOutbox,
    outboxCollectionDef,
    type Clock,
    type OutboxHandler,
} from "@yorozu/outbox"

let clock: Clock = { now: () => Date.now() }
let log: Logger | undefined

// tests
let store = openMemoryOutbox({ clock })

// prod: host opens a driver and wraps the collection
let db = await openMemoryDb({
    name: "app",
    version: 1,
    collections: [outboxCollectionDef()],
})
store = createOutboxStore({
    collection: db.collection("outbox"),
    db,
    clock,
    log,
})

let handlers: Record<string, OutboxHandler> = {
    "msg/send": {
        process: async (entry) => {
            /* call API; must be idempotent */
        },
        onExhausted: async (entry) => {
            /* surface failed send for manual retry */
        },
    },
    "msg/react": {
        process: async (entry) => {
            /* call API */
        },
        rollback: async (entry) => {
            /* revert optimistic reaction */
        },
    },
}

let worker = new OutboxWorker(store, handlers, {
    log, // optional; silent default
    clock,
    isOnline: () => navigator.onLine,
    isRetryableError: (err) => true,
    onActivity: () => {
        /* push outbox status */
    },
    // prune: false to disable; default 90d / 200 failed
})
worker.start()
```

Logger is optional. Internally: `makeLog(opts.log ?? makeSilentLog(), "yorozu-outbox")`. Process flow is `outbox-process` (`start` / `done` / `retry` / `skip` / `error`).

## Musts

- Claim/lease is a queue. Host injects `OutboxStore` + `Clock` + logger + handlers.
- Success deletes. Non-retryable or max attempts exhaust. Offline `releaseUncounted` (does not count toward the cap) then skip. Else exponential backoff on `reservedTo`: `min(base * 2^(attempts-1), cap)` minus 0–20% jitter.
- Unknown type: `warn("never-happen")` then delete.
- `onExhausted` → `markFailed` (retain). Else `rollback?` then delete.
- Messenger keeps SyncManager, connectivity pause/resume, `withDurableWrite` / durability, and domain handlers. This package does not own those.
- Tests in this package use `openMemoryOutbox` / `openMemoryDb` only. Do not import `@yorozu/db-idb` or `@yorozu/db-sqlite` here.
