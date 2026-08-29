# @yorozu/resource-cache

Blob TTL / bytes / count engine. Persistence is an injected `@yorozu/db` `Collection`. This package does not open IndexedDB or SQLite; the host supplies a driver.

## Setup

```ts
import { openMemoryDb } from "@yorozu/db" // tests; prod: host driver.open
import type { Logger } from "@yorozu/log"
import { BytesLruMap, createResourceCache, dropDelete, dropStripBlob, resourceSchema } from "@yorozu/resource-cache"

let db = await openMemoryDb(resourceSchema("media", ["blobs", "thumbs"]))
let log: Logger | undefined
let blob: Blob
let caps = {
    maxBytes: 1024 ** 3,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    maxEntries: 2000,
}

let blobs = createResourceCache({
    collection: db.collection("blobs"),
    drop: dropStripBlob(),
    caps,
    evictMetaEveryNPuts: 50,
    log, // optional; silent default
    l1: new BytesLruMap({
        maxBytes: 64 * 1024 * 1024,
        maxEntries: 512,
        sizeOf: (r) => r.bytes,
        onEvict: (key) => {
            /* revoke object URLs */
        },
    }),
    onDropped: (keys, reason) => {
        if (reason === "bytes" || reason === "ttl") {
            /* revoke object URLs */
        }
    },
})

await blobs.put({ key: "a", storedAt: Date.now(), blob, meta: { name: "a.png" } })
await blobs.setCaps({ ...caps, maxBytes: 512 * 1024 ** 2 })
await blobs.evict("full")

let thumbs = createResourceCache({
    collection: db.collection("thumbs"),
    drop: dropDelete,
    caps: { maxBytes: 512 * 1024 * 1024, maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
})
```

Logger is optional. Internally: `makeLog(opts.log ?? makeSilentLog(), "yorozu-resource-cache")`. Bytes trim uses flow `resource-evict` (`start` / `skip` / `done`).

Omitted caps turn that policy off. `dropDelete` removes rows. `dropStripBlob()` keeps the row, `bytes === 0`, no blob. A host that wants strip on bytes and delete on TTL/count composes `plan.reason` in its own `DropHandler`.

## Musts

- Port is `Collection`. Host opens memory / IDB / SQLite via a `DbDriver` and passes `db.collection(...)`.
- Covering index `by-evict` is `["storedAt", "bytes"]`. Eviction walks `scan("by-evict", { keysOnly: true })`. Never `getAll()` on blob collections.
- Bytes: `getBytesTotal` then ordered pick. Under cap: do not scan for the pick.
- `put` bytes come from `blob.size`. If `maxBytes` is set and `bytes > maxBytes`, put is a no-op.
- Tests in this package use `openMemoryDb` only. Do not import `@yorozu/db-idb` or `@yorozu/db-sqlite` here.
