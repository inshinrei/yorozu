# Offline packages — db, resource-cache, outbox

Date: 2026-08-29  
Repo: yorozu (current `main`)  
Source research: vkws-messenger SDK storage/outbox/files, Telegram (telegram-tt, tdesktop `lib_storage`, Telegram-iOS Postbox/MediaBox), sketches `~/Downloads/yorozu-{db,file-res,bytes-cap}.md`.

**Goal:** Land reusable `@yorozu/*` packages that can replace vkws persistence, blob-cache physics, and the outbox worker. Messenger is unreleased — no backwards compatibility. vkws itself is **not** migrated in this repo; Desktop `wsm-*.md` files describe how.

## Non-goals

- Migrating vkws-messenger code
- Network fetch / in-flight dedup (`createCachedResource` stays in vkws)
- Preview-quality ranking, FS URIs, object URLs, user-settings GiB UI
- SyncParticipant, RAPI, Svelte
- ORM, SQL query builder, Prisma-like migrations
- Extracting DebouncedWriter / ErrorPolicy / bigint JSON (later)

## Package map

```
@yorozu/log              makeLog / makeSilentLog / test log (halua 5)
@yorozu/db               Collection types + openMemoryDb
@yorozu/db-idb           IndexedDB driver
@yorozu/db-sqlite        better-sqlite3 thin wrapper + driver
@yorozu/resource-cache   blob TTL / bytes / count engine (Collection in)
@yorozu/outbox           durable job queue + worker
```

Dependency direction:

```
log
db  → utils (MaybePromise only if needed; prefer Promise)
db-idb     → db, log
db-sqlite  → db, log, better-sqlite3
resource-cache → db, log, utils (LruMap not required; BytesLruMap is local)
outbox     → db, log, utils (timers, AsyncLock)
```

`resource-cache` and `outbox` **must not** import `db-idb` or `db-sqlite`. Tests use `openMemoryDb`.

Version: `0.3.1` to match the workspace. `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, `sideEffects: false`.

## Code style (yorozu)

- 4 spaces, no semicolons, double quotes, printWidth 120 (`.prettierrc`)
- `let` over `const` except arrow functions and module-level
- `protected` over `private`
- Explicit return types on exported functions/methods (`isolatedDeclarations`)
- Tests: co-located `*.unit.ts`, vitest, already picked up by root `packages/**/*.unit.ts`
- `.error` only for `Error` instances

## Logger

Public type (re-export from `@yorozu/log`):

```ts
import type {HaluaLogger, SpanFlowApi} from "halua"
export type Logger = HaluaLogger<Record<string, unknown>, SpanFlowApi> & SpanFlowApi
```

### `makeSilentLog(): Logger`

```ts
createHalua().use(spanFlow()).build()
```

No dispatchers → level methods are no-ops. `.span(label, fn)` **still executes `fn`** and rethrows. This is the bulk default.

### `makeLog(src: Logger, issueKey: string): Logger`

Proxy binder copied from vkws `makeLog`: force `{issueKey}` on `.error` / `.assert`; wrap `.child` / `.flow` / `.create` / `.span` so descendants keep the key; reimplement `.span` so failures go through `reportFlowFailure`.

Throw if `src.flow` is missing.

### `reportFlowFailure(flow, err, ctx?)`

`err instanceof Error` → `flow.error(err, ctx)`; else `flow.warn("never-happen", {err, ...ctx})`.

### `createTestLog()` / `expectFlowStory`

Same as vkws: `createHalua().dispatchers(NewTextDispatcher(() => {})).use(spanFlow()).use(capture()).level(Level.Trace).build()`. `expectFlowStory(records, name, events)` exact-match on flow events, dropping span children.

### Setup rule (every I/O package)

```ts
log?: Logger   // optional in public setup
// internally:
this.log = makeLog(opts.log ?? makeSilentLog(), ISSUE_KEY)
// never this.log?.
```

`@yorozu/db` memory driver has no logger (pure maps). Drivers, resource-cache, and outbox do.

Issue keys:

| Package | issueKey |
| --- | --- |
| db-idb | `yorozu-db-idb` |
| db-sqlite | `yorozu-db-sqlite` |
| resource-cache | `yorozu-resource-cache` |
| outbox | `yorozu-outbox` |

---

## `@yorozu/db`

### Types

```ts
export type IndexKey = string | number | Array<string | number>

export type IndexDef = {
    name: string
    keyPath: string | readonly string[]
    unique?: boolean
}

export type CollectionDef = {
    name: string
    keyPath: string
    indexes?: readonly IndexDef[]
}

export type DbSchema = {
    name: string
    version: number
    collections: readonly CollectionDef[]
}

export type ScanBound = {
    lt?: IndexKey
    lte?: IndexKey
    gt?: IndexKey
    gte?: IndexKey
    limit?: number
    /**
     * When true, implementations MUST NOT materialize row values
     * (IDB: openKeyCursor; SQLite: SELECT pk + index columns only).
     * ScanHit.value is omitted.
     */
    keysOnly?: boolean
}

export type ScanHit<T> = {
    primaryKey: string
    indexKey: IndexKey
    value?: T
}

export type PutOpts = {flush?: "now" | "batch"}

export interface Collection<T extends Record<string, unknown> = Record<string, unknown>> {
    readonly name: string
    get(key: string): Promise<T | null>
    getMany(keys: readonly string[]): Promise<Array<T | null>>
    put(row: T, opts?: PutOpts): Promise<void>
    putMany(rows: readonly T[], opts?: PutOpts): Promise<void>
    delete(keys: readonly string[]): Promise<void>
    clear(): Promise<void>
    count(): Promise<number>
    /** Full values. Do not use on blob collections for eviction. */
    getAll(): Promise<T[]>
    scan(index: string, bound?: ScanBound): Promise<Array<ScanHit<T>>>
}

export type TxMode = "r" | "rw"

export interface Db {
    readonly schema: DbSchema
    collection<T extends Record<string, unknown>>(name: string): Collection<T>
    transact<R>(names: readonly string[], mode: TxMode, fn: (db: Db) => Promise<R>): Promise<R>
    flush(): Promise<void>
    close(): Promise<void>
}

export interface DbDriver {
    open(schema: DbSchema): Promise<Db>
    drop?(schema: DbSchema): Promise<void>
}
```

Reserved index name `"__pk"`: primary-key walk in key order. Drivers implement it even if not in `CollectionDef.indexes`.

Default `put` flush is `"now"`. `"batch"` buffers until `db.flush()` (or the next `transact` commit). Memory treats `"batch"` as `"now"` (no buffer) **except** it must still be valid to call `flush()` as a no-op.

Nested `transact` throws. Concurrent `transact` on overlapping names serializes (mutex).

### Index key comparison (IDB-compatible)

`compareIndexKey(a, b): -1 | 0 | 1`

- Types: number < string < array (other types throw).
- Numbers: numeric compare. NaN is invalid.
- Strings: UTF-16 code unit compare (`<` / `>`).
- Arrays: lexicographic; if a prefix-equal, **shorter array is less**: `[cutoff] < [cutoff, 0]`.

`inRange(indexKey, bound)` applies exclusive/inclusive bounds with that compare.

Prefix TTL: `scan("by-evict", {lt: [cutoff], keysOnly: true})` matches every `[storedAt, bytes]` with `storedAt < cutoff`.

### `openMemoryDb(schema): Promise<Db>`

Maps per collection. `scan`: project `keyPath` fields, filter, sort via `compareIndexKey`. `keysOnly` omits `value` (do not clone blobs). `transact` uses `AsyncLock` (or equivalent mutex).

Unknown collection / unknown index throws.

---

## `@yorozu/db-idb`

```ts
export function createIdbDriver(opts?: {
    dbName?: string
    indexedDB?: IDBFactory
    log?: Logger
    /** When true for a collection name, put({flush:"batch"}) uses a writeLater buffer. Default: all collections batch-capable. */
    deferPut?: (collectionName: string) => boolean
}): DbDriver
```

Open: `indexedDB.open(name, schema.version)`. `onupgradeneeded`: create missing stores (`keyPath` from schema) and missing indexes. No messenger `__ver:` markers.

`scan(..., {keysOnly:true})` → `index.openKeyCursor(range)` only. Never `cursor.value`.

`getMany` / `putMany` / `delete` share one transaction.

`flush()`: one multi-store `readwrite` tx for all pending batch puts. Coalesce by `(collection, pk)` so N puts of the same key become one.

`drop`: `indexedDB.deleteDatabase`.

Tests: `fake-indexeddb` in Node. Dev dependency of this package.

Public types of `@yorozu/db-idb` may mention `IDBFactory`. `@yorozu/db` types must not.

---

## `@yorozu/db-sqlite`

Thin wrapper around **better-sqlite3** (runtime dependency of this package). Node-only.

```ts
import type Database from "better-sqlite3"

export type SqliteStatement = {
    run(params?: readonly unknown[]): void
    all<T = Record<string, unknown>>(params?: readonly unknown[]): T[]
    get<T = Record<string, unknown>>(params?: readonly unknown[]): T | undefined
}

export type SqliteHandle = {
    exec(sql: string): void
    prepare(sql: string): SqliteStatement
    transaction<T>(fn: () => T): T
    close(): void
}

/** Wrap a better-sqlite3 Database. */
export function wrapBetterSqlite3(db: Database.Database): SqliteHandle

export function createSqliteDriver(opts: {
    filename: string
    /** Inject native ctor (tests). Default: better-sqlite3 default export. */
    native?: typeof Database
    log?: Logger
}): DbDriver
```

`createSqliteDriver`:

1. `new Native(filename)`
2. `pragma journal_mode = WAL` (ignore failure on `:memory:`)
3. `wrapBetterSqlite3`
4. Apply schema: one table per collection

Table layout:

```sql
CREATE TABLE IF NOT EXISTS "<collection>" (
  pk TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL
  -- plus one column per index field: "<index>__<i>" typed TEXT/REAL
);
-- blobs sidecar:
CREATE TABLE IF NOT EXISTS "<collection>__blobs" (
  pk TEXT NOT NULL,
  field TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (pk, field)
);
CREATE INDEX IF NOT EXISTS "<collection>_<index>" ON "<collection>" (...index columns...);
```

`payload` is JSON of the row **minus** `Blob` / `ArrayBuffer` / `Uint8Array` / Node `Buffer` fields. Those go to `__blobs`. `get` rehydrates `Blob` when `Blob` exists in the environment, otherwise `Uint8Array`.

`scan keysOnly`: `SELECT pk, index columns FROM table WHERE ... ORDER BY ...` — never join `__blobs`, never `payload`.

Async `transact`: mutex + `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`. Do **not** use better-sqlite3 `db.transaction(fn)` for the public async `Db.transact` (that API is sync-only). Use it internally for sync put batches.

`drop`: close + `fs.unlink` the file when `filename !== ":memory:"`.

Tests use real better-sqlite3 with `filename: ":memory:"`.

---

## `@yorozu/resource-cache`

### `bytes-cap.ts`

Identical semantics to vkws `bytes-capacity-evict.ts`.

### `BytesLruMap`

Session L1. Incremental `byteSize`. Promote on `get`. After `set`, evict LRU while over `maxBytes` or `maxEntries`. Oversize insert (`sizeOf(v) > maxBytes`) and `acceptOversize !== true`: do not insert, return `false`. `setMaxBytes` shrinks immediately. `onEvict` fires on eviction (revoke URLs). Iterator LRU-first.

### `BlobBytesLedger`

vkws `_blob-bytes-ledger.ts` epoch loop. `getTotal` retries if `note`/`forget`/`invalidate` ran during `listItems`.

### Row + schema

```ts
export const BY_EVICT_INDEX = "by-evict"

export type ResourceRow<Meta = unknown> = {
    key: string
    storedAt: number
    bytes: number
    blob?: Blob
    meta: Meta
}

export function resourceCollectionDef(name: string): CollectionDef
export function resourceSchema(dbName: string, collectionNames: string[], version?: number): DbSchema
```

`by-evict` keyPath: `["storedAt", "bytes"]`.

### Drop

```ts
export type DropReason = "ttl" | "count" | "bytes"
export type DropPlan = {keys: string[]; reason: DropReason}
export type DropHandler<Meta = unknown> = {
    apply(col: Collection<ResourceRow<Meta>>, plan: DropPlan): Promise<void>
}
export let dropDelete: DropHandler<unknown>
export function dropStripBlob<Meta = unknown>(): DropHandler<Meta>
```

### `createResourceCache`

```ts
export type ResourceCacheCaps = {
    maxBytes?: number
    maxAgeMs?: number
    maxEntries?: number
}

export function createResourceCache<Meta = unknown>(opts: {
    collection: Collection<ResourceRow<Meta>>
    drop: DropHandler<Meta>
    caps?: ResourceCacheCaps
    l1?: BytesLruMap<string, ResourceRow<Meta>>
    onDropped?(keys: string[], reason: DropReason): void
    evictMetaEveryNPuts?: number
    log?: Logger
}): ResourceCache<Meta>
```

Evict body: TTL then count (`meta`); bytes uses `getBytesTotal` then ordered pick. **Under cap: do not `scan`.**

`put`: compute bytes from blob.size; if `maxBytes` set and `bytes > maxBytes`, no-op (do not put). Then ledger wrap put, L1 set, bytes evict if needed, every N puts meta evict.

Omitted caps = policy off.

---

## `@yorozu/outbox`

Not a Collection. Claim/lease is a queue.

```ts
export type OutboxEntry = {
    id: string
    createdAt: number
    reservedTo: number
    type: string
    payload: unknown
    rollbackType?: string
    rollbackPayload?: unknown
    attempts: number
    lastError?: string
    failedAt?: number
}

export type Clock = {now(): number}

export interface OutboxStore {
    enqueue(params: {
        type: string
        payload: unknown
        rollbackType?: string
        rollbackPayload?: unknown
    }): Promise<string>
    get(id: string): Promise<OutboxEntry | null>
    claim(leaseDurationMs: number): Promise<OutboxEntry | null>
    delete(id: string): Promise<void>
    release(id: string): Promise<void>
    updateAfterFailure(id: string, error: string, nextReservedTo?: number): Promise<void>
    markFailed(id: string, error?: string): Promise<void>
    listFailed(): Promise<OutboxEntry[]>
    retry(id: string): Promise<void>
    releaseUncounted(id: string, error?: string, nextReservedTo?: number): Promise<void>
    deleteAll(): Promise<void>
    count(): Promise<number>
}

export function openMemoryOutbox(opts?: {clock?: Clock}): OutboxStore

export function outboxCollectionDef(name?: string): CollectionDef

export function createOutboxStore(opts: {
    collection: Collection<OutboxEntry & Record<string, unknown>>
    db: Db
    clock?: Clock
    log?: Logger
}): OutboxStore
```

`outboxCollectionDef` (default name `"outbox"`):

```
keyPath: "id"
indexes: [
  {name: "by-claim", keyPath: ["reservedTo", "createdAt"]},
  {name: "by-failed", keyPath: ["failedAt", "createdAt"]},
]
```

Claim: among `failedAt == null && reservedTo <= now`, pick min `createdAt`; set `reservedTo = now + lease`, increment `attempts`. Scan `by-claim` with `lte: [now, Number.MAX_SAFE_INTEGER]`. `markFailed` sets `failedAt = now` and `reservedTo = Number.MAX_SAFE_INTEGER` so failed rows drop out of the due scan. `retry` clears `failedAt`, `attempts = 0`, `reservedTo = 0`.

Enqueue ids: `now.toString(36) + "-" + random`. `clock.now()` for all timestamps.

### Worker

```ts
export type OutboxHandler = {
    process: (entry: OutboxEntry) => Promise<void>
    rollback?: (entry: OutboxEntry) => Promise<void>
    onExhausted?: (entry: OutboxEntry) => Promise<void>
}

export class OutboxWorker {
    constructor(
        store: OutboxStore,
        handlers: Record<string, OutboxHandler>,
        options?: {
            pollIntervalMs?: number
            leaseDurationMs?: number
            maxAttempts?: number
            retryBaseMs?: number
            retryCapMs?: number
            isOnline?: () => boolean
            isRetryableError?: (err: unknown) => boolean
            onActivity?: () => void
            log?: Logger
            clock?: Clock
            prune?: {maxAgeMs: number; maxCount: number} | false
        },
    )
    start(): void
    stop(): void
    pause(): void
    resume(): void
}
```

Algorithm = vkws `CoreOutboxWorker._tick` (success delete; non-retryable exhaust; offline `releaseUncounted`; max attempts exhaust; else exponential backoff on `reservedTo` with 0–20% subtractive jitter). Defaults: poll 2000, lease 30000, maxAttempts 5, retryBase 1000, retryCap 30000. Prune default 90d / 200 failed. `prune: false` disables.

Unknown type: `warn("never-happen")` then delete.

LDD flow name: `outbox-process` (`start` / `done` / `retry` / `skip` / `error`).

Injectable `clock` (tests). Timers from `@yorozu/utils`.

---

## Architecture refinements vs vkws

| vkws | Package |
| --- | --- |
| 6 cloned IDB keyed repos | `Collection` |
| `writeLater` no coalescing | flush coalesces by pk |
| `getAllForChat` full table scan | stay in vkws; later `scan("by-chat")` |
| files L1 count LRU leaks object URLs | `BytesLruMap.onEvict` |
| `getAllMeta` loads blob via value cursor | `keysOnly` / covering index |
| outbox claim JS min over due rows | same pick, but `markFailed` kicks `reservedTo` to MAX |
| `Date.now()` baked in | `Clock` |
| required logger | optional setup, silent default |
| sqlite absent | `@yorozu/db-sqlite` + better-sqlite3 |

---

## Desktop docs (written last)

Path: `/Users/kiwidancebad/Desktop/`

Migration (replace modules with pkgs; no compat):

- `wsm-log.md`
- `wsm-db.md`
- `wsm-resource-cache.md`
- `wsm-outbox.md`

Telegram practices that stay in vkws (not packages):

- `perf-wsm-media-pipeline.md` — size ladder, progressive Range, small-complete-only durable cache, evict from index (telegram-tt `mediaLoader` / `cacheApi` / SW progressive)
- `perf-wsm-history-viewport.md` — viewport slice persist; stop `getAllForChat` full-store scan
- `perf-wsm-writes.md` — coalesce batch puts; idle/visibility flush; `putMany`
- `perf-wsm-download-queue.md` — visible > preload, cancel off-screen (tt `dcBandwithManager`)

Each `wsm-*.md` lists: what to delete, what to wrap, composition-root wiring, schema indexes, LDD, test ports. Each `perf-wsm-*.md` lists: Telegram evidence (path + symbol), current vkws path, change steps, expected benefit.

## Verification

- `pnpm exec vitest run packages/log packages/db packages/db-idb packages/db-sqlite packages/resource-cache packages/outbox`
- Root typecheck includes new packages
- resource-cache tests never open IDB or sqlite
- sqlite tests use `:memory:` better-sqlite3
- idb tests use fake-indexeddb
