# Offline packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `@yorozu/log`, `@yorozu/db`, `@yorozu/db-idb`, `@yorozu/db-sqlite` (thin better-sqlite3 wrapper), `@yorozu/resource-cache`, and `@yorozu/outbox`, then write Desktop `wsm-*.md` / `perf-wsm-*.md` migration and perf docs.

**Architecture:** Injectable `Collection` port (memory / IDB / sqlite drivers). Resource-cache is blob physics on a `Collection`. Outbox is a claim/lease queue (not a Collection) with an optional Collection-backed store. Logger is Halua 5: optional in setup, required internally via `makeLog(src ?? makeSilentLog(), issueKey)`.

**Tech Stack:** TypeScript ESM, vitest, pnpm workspace, halua 5, fake-indexeddb, better-sqlite3.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-offline-packages-design.md` — APIs there are source of truth; do not invent extra public surface.
- Style: 4 spaces, `semi: false`, double quotes, printWidth 120, `let` over `const` except arrow functions and module-level, `protected` over `private`.
- `isolatedDeclarations`: explicit return types on every exported function, method, and getter.
- Tests: co-located `*.unit.ts`; run via `pnpm exec vitest run <path>`. TDD: write failing test, watch it fail, then implement.
- `.error` only for `Error` instances; else `warn("never-happen", {err})`.
- `@yorozu/db` public types never mention IndexedDB or SQLite.
- `resource-cache` and `outbox` must not import `@yorozu/db-idb` or `@yorozu/db-sqlite`.
- Package version `0.3.1`, `"type": "module"`, export `"."` → `./src/index.ts`, `sideEffects: false`.
- Work on current branch (do not create a worktree). Commit per task.
- Do not migrate vkws-messenger. Desktop docs are the migration artifact.
- Halua version `5.0.0`. sqlite package depends on `better-sqlite3` (thin wrap). IDB tests use `fake-indexeddb`.
- Issue keys: `yorozu-db-idb`, `yorozu-db-sqlite`, `yorozu-resource-cache`, `yorozu-outbox`.

---

### Task 1: `@yorozu/log`

**Files:**
- Create: `packages/log/package.json`
- Create: `packages/log/tsconfig.json`
- Create: `packages/log/src/index.ts`
- Create: `packages/log/src/types.ts`
- Create: `packages/log/src/silent.ts`
- Create: `packages/log/src/make-log.ts`
- Create: `packages/log/src/test-log.ts`
- Create: `packages/log/src/silent.unit.ts`
- Create: `packages/log/src/make-log.unit.ts`
- Create: `packages/log/src/test-log.unit.ts`
- Create: `packages/log/README.md`

**Interfaces:**
- Consumes: `halua@5.0.0`
- Produces: `Logger`, `makeSilentLog()`, `makeLog(src, issueKey)`, `reportFlowFailure`, `createTestLog()`, `expectFlowStory`, re-exports `createHalua`, `spanFlow`, `capture`, `Level`, `NewTextDispatcher`

- [ ] **Step 1: Scaffold + install halua**

```json
{
    "name": "@yorozu/log",
    "version": "0.3.1",
    "type": "module",
    "sideEffects": false,
    "author": "inshinrei",
    "license": "MIT",
    "description": "halua logger helpers (makeLog, silent, test)",
    "exports": {
        ".": "./src/index.ts"
    },
    "dependencies": {
        "halua": "5.0.0"
    }
}
```

`tsconfig.json`: `{ "extends": "../../tsconfig.json" }`

Run: `pnpm install` at repo root so workspace links and `halua` resolve.

- [ ] **Step 2: Failing tests for silent + span still runs**

```ts
import {describe, expect, it, vi} from "vitest"
import {makeSilentLog} from "./silent"

describe("makeSilentLog", () => {
    it("executes span callbacks with no dispatchers", async () => {
        let log = makeSilentLog()
        let ran = 0
        let value = await log.span("work", async () => {
            ran++
            return 7
        })
        expect(ran).toBe(1)
        expect(value).toBe(7)
    })

    it("rethrows from span", async () => {
        let log = makeSilentLog()
        await expect(
            log.span("boom", async () => {
                throw new Error("x")
            }),
        ).rejects.toThrow("x")
    })
})
```

Run: `pnpm exec vitest run packages/log/src/silent.unit.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement silent + types**

```ts
// types.ts
import type {HaluaLogger, SpanFlowApi} from "halua"
export type Logger = HaluaLogger<Record<string, unknown>, SpanFlowApi> & SpanFlowApi
```

```ts
// silent.ts
import {createHalua, spanFlow} from "halua"
import type {Logger} from "./types"

export function makeSilentLog(): Logger {
    return createHalua().use(spanFlow()).build() as Logger
}
```

- [ ] **Step 4: Failing tests for makeLog issueKey + reportFlowFailure**

`make-log.unit.ts`: wrap `createTestLog()`, call `makeLog(raw, "yorozu-test")`, `log.error(new Error("e"))`, assert `raw.collect()` errorMeta has `issueKey: "yorozu-test"`. Nested `log.flow("x").span("s", fn)` that throws: issueKey present. `reportFlowFailure` with `Error` → error record; with `"{}"` string → `never-happen` warn, no `.error`.

Throw if `makeLog` given an object without `.flow`.

- [ ] **Step 5: Implement makeLog proxy** (copy vkws `packages/core/src/utils/log.ts` behavior; do not import messenger). Use `performance.now()` for span elapsedMs.

- [ ] **Step 6: Failing tests for createTestLog + expectFlowStory**

Flow `start` then `done` matches `["start","done"]`. Extra `skip` fails. Span `start/done` is excluded from the story. `.error` on the flow child counts as `"error"`.

- [ ] **Step 7: Implement test-log.ts** (vkws `test-log.ts` logic; `expectFlowStory` accepts `string` flow names, not a frozen catalog).

- [ ] **Step 8: Barrel + README**

Re-export types and `createHalua`, `spanFlow`, `capture`, `Level`, `NewTextDispatcher` from `halua`.

README: optional logger in setup, silent default, span still runs.

- [ ] **Step 9: Run package tests, commit**

```bash
pnpm exec vitest run packages/log
git add packages/log pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(log): add @yorozu/log makeLog, silent, and test helpers

EOF
)"
```

---

### Task 2: `@yorozu/db` types, bounds, memory driver

**Files:**
- Create: `packages/db/package.json`, `tsconfig.json`, `README.md`
- Create: `packages/db/src/index.ts`, `types.ts`, `bounds.ts`, `bounds.unit.ts`, `memory.ts`, `memory.unit.ts`

**Interfaces:**
- Consumes: none required (`@yorozu/utils` allowed for `AsyncLock`)
- Produces: types from spec, `compareIndexKey`, `inRange`, `openMemoryDb`

- [ ] **Step 1: Scaffold** `package.json` name `@yorozu/db`, version `0.3.1`, description `injectable collection store (memory driver)`, deps `@yorozu/utils: workspace:^`. `pnpm install`.

- [ ] **Step 2: Failing bounds tests**

```ts
import {describe, expect, it} from "vitest"
import {compareIndexKey, inRange} from "./bounds"

describe("compareIndexKey", () => {
    it("orders number < string < array", () => {
        expect(compareIndexKey(1, "a")).toBe(-1)
        expect(compareIndexKey("a", [1])).toBe(-1)
    })

    it("treats shorter prefix-equal array as less", () => {
        expect(compareIndexKey([20], [20, 0])).toBe(-1)
        expect(compareIndexKey([20, 0], [20])).toBe(1)
    })
})

describe("inRange prefix TTL", () => {
    it("lt [cutoff] excludes storedAt === cutoff", () => {
        expect(inRange([20, 8], {lt: [20]})).toBe(false)
        expect(inRange([19, 99], {lt: [20]})).toBe(true)
    })
})
```

Run: `pnpm exec vitest run packages/db/src/bounds.unit.ts` — FAIL.

- [ ] **Step 3: Implement bounds.ts** exactly as spec (IDB-compatible). Throw on unsupported types (boolean, object, null).

- [ ] **Step 4: Freeze types.ts** from the spec (`Collection`, `Db`, `DbDriver`, `ScanBound`, `PutOpts`, `getMany`/`putMany`, `flush`). Barrel-export.

- [ ] **Step 5: Failing memory driver tests** (`memory.unit.ts`)

Cover:
- put/get/delete/count/getAll
- `getMany` order matches keys, missing → `null`
- `putMany`
- scan `__pk`
- compound `by-evict` keysOnly: hit has no `value`; `lt: [20]` excludes `storedAt === 20`
- keysOnly does not include a `blob` field on the hit
- nested `transact` throws
- unknown collection / unknown index throws
- `flush()` resolves

Use a resource-like row `{key, storedAt, bytes, blob?: Blob, meta: {}}` with `keyPath: "key"` and index `by-evict` on `["storedAt","bytes"]`.

- [ ] **Step 6: Implement `openMemoryDb`**

Project index keys by reading `keyPath` fields (support `a.b`? **No** — only top-level field names, including compound arrays). Primary key must be string (coerce with `String(...)`).

`transact`: mutex; run `fn` with the same `Db`; nested call throws.

Memory `put` flush `"batch"` behaves as `"now"`. `flush` is a no-op.

- [ ] **Step 7: README** — how to implement a driver (~20 lines of musts: keysOnly, prefix bounds, no IDB types).

- [ ] **Step 8: Tests + commit**

```bash
pnpm exec vitest run packages/db
git add packages/db pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(db): add @yorozu/db Collection types and memory driver

EOF
)"
```

---

### Task 3: `@yorozu/db-idb`

**Files:**
- Create: `packages/db-idb/package.json`, `tsconfig.json`, `README.md`
- Create: `packages/db-idb/src/index.ts`, `driver.ts`, `driver.unit.ts`, `range.ts`

**Interfaces:**
- Consumes: `@yorozu/db` types + `compareIndexKey` if needed; `@yorozu/log`
- Produces: `createIdbDriver`

- [ ] **Step 1: Scaffold** deps `@yorozu/db`, `@yorozu/log` workspace; devDependency `fake-indexeddb` (latest 6.x). `pnpm install`.

- [ ] **Step 2: Failing tests** — at top of unit file:

```ts
import "fake-indexeddb/auto"
import {createIdbDriver} from "./driver"
import {resourceSchema} from "../../resource-cache/src/row"
```

**Do not import resource-cache** in this task (it does not exist yet). Inline a tiny schema:

```ts
let schema = {
    name: "t",
    version: 1,
    collections: [
        {
            name: "files",
            keyPath: "key",
            indexes: [{name: "by-evict", keyPath: ["storedAt", "bytes"]}],
        },
        {name: "contacts", keyPath: "id"},
    ],
}
```

Tests:
- put/get/delete/count
- `scan("by-evict", {keysOnly: true, lt: [cutoff]})` does not load values; spy that we never read `cursor.value` (assert hits have no `value`, and a stored Blob is not cloned — put a Blob, keysOnly hits `value` undefined)
- prefix bound excludes `storedAt === cutoff`
- `putMany` in one logical batch
- `flush` coalesces two batch puts of the same pk to the last row
- `transact` serializes rw
- `drop` then open is empty
- optional `log` accepted (pass `makeSilentLog()`)

- [ ] **Step 3: Implement driver**

`createIdbDriver` as spec. Build `IDBKeyRange` from `ScanBound` using IDB array keys. `keysOnly` → `openKeyCursor`. Collect hits, wait for tx complete.

Batch buffer: `Map<string, Map<string, row>>` keyed by collection then pk. `flush` writes them.

`deferPut` if provided: when it returns false, `flush: "batch"` still writes now.

Logger: `makeLog(opts.log ?? makeSilentLog(), "yorozu-db-idb")` on open/drop errors.

- [ ] **Step 4: README + tests + commit**

```bash
pnpm exec vitest run packages/db-idb
git add packages/db-idb pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(db-idb): add IndexedDB driver for @yorozu/db

EOF
)"
```

---

### Task 4: `@yorozu/db-sqlite`

**Files:**
- Create: `packages/db-sqlite/package.json`, `tsconfig.json`, `README.md`
- Create: `packages/db-sqlite/src/index.ts`, `handle.ts`, `handle.unit.ts`, `driver.ts`, `driver.unit.ts`

**Interfaces:**
- Consumes: `@yorozu/db`, `@yorozu/log`, `better-sqlite3`
- Produces: `SqliteHandle`, `SqliteStatement`, `wrapBetterSqlite3`, `createSqliteDriver`

- [ ] **Step 1: Scaffold** deps `better-sqlite3` (current 11.x or 12.x, pin an exact version), `@types/better-sqlite3` as devDependency, workspace `@yorozu/db` + `@yorozu/log`. `pnpm install` (native compile).

- [ ] **Step 2: Failing wrap tests**

```ts
import Database from "better-sqlite3"
import {wrapBetterSqlite3} from "./handle"

it("wraps exec/prepare/transaction/close", () => {
    let raw = new Database(":memory:")
    let h = wrapBetterSqlite3(raw)
    h.exec("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)")
    h.prepare("INSERT INTO t (id, n) VALUES (?, ?)").run(["a", 1])
    expect(h.prepare("SELECT n FROM t WHERE id = ?").get(["a"])).toEqual({n: 1})
    h.transaction(() => {
        h.prepare("INSERT INTO t (id, n) VALUES (?, ?)").run(["b", 2])
    })
    expect(h.prepare("SELECT COUNT(*) AS c FROM t").get()!.c).toBe(2)
    h.close()
})
```

better-sqlite3 `stmt.run(...params)` vs `stmt.run(params)`: use **array bind** `stmt.run(...params)` inside the wrapper so callers pass `params?: readonly unknown[]`.

- [ ] **Step 3: Implement `wrapBetterSqlite3`** — thin: `exec`, `prepare` → `{run, all, get}`, `transaction(fn) => db.transaction(fn)()`, `close`.

- [ ] **Step 4: Failing driver tests** with `createSqliteDriver({filename: ":memory:"})` and the same two-collection schema as Task 3.

Cover: put/get with a `Blob` (or `Uint8Array` if Blob roundtrip is awkward — **must roundtrip Blob when global Blob exists**), keysOnly scan does not SELECT payload / blobs, prefix `lt: [cutoff]`, `getMany`/`putMany`, transact nested throws, drop on `:memory:` is safe, blob sidecar not read on keysOnly (assert by putting a large Uint8Array and scanning keysOnly quickly).

- [ ] **Step 5: Implement driver** as spec (tables, blob sidecar, BEGIN IMMEDIATE for async transact, WAL pragma). Identifier quoting: only allow collection/index names matching `/^[A-Za-z0-9_-]+$/` and quote as `"name"`. Throw on illegal names.

- [ ] **Step 6: README + tests + commit**

```bash
pnpm exec vitest run packages/db-sqlite
git add packages/db-sqlite pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(db-sqlite): add better-sqlite3 driver for @yorozu/db

EOF
)"
```

---

### Task 5: `@yorozu/resource-cache` primitives (bytes-cap, BytesLruMap, ledger)

**Files:**
- Create: `packages/resource-cache/package.json`, `tsconfig.json`
- Create: `packages/resource-cache/src/bytes-cap.ts`, `bytes-cap.unit.ts`
- Create: `packages/resource-cache/src/bytes-lru-map.ts`, `bytes-lru-map.unit.ts`
- Create: `packages/resource-cache/src/blob-bytes-ledger.ts`, `blob-bytes-ledger.unit.ts`
- Create: `packages/resource-cache/src/index.ts` (partial exports)

**Interfaces:**
- Consumes: none yet
- Produces: `BytesCapItem`, `pickOldestOverBytesCap`, `pickOldestOverBytesCapOrdered`, `BytesLruMap`, `BlobBytesLedger`

- [ ] **Step 1: Scaffold** deps `@yorozu/db`, `@yorozu/log`, `@yorozu/utils` workspace. Empty `index.ts` exporting nothing yet is OK until step 5.

- [ ] **Step 2: Failing bytes-cap tests** (port vkws `bytes-capacity-evict.unit.ts` exactly):

- under/equal cap → `[]`
- oldest-first drop
- skip zero-byte
- `capBytes <= 0` drops positives
- ordered helper does **not** sort (newest listed first still drops first)

Then implement `bytes-cap.ts` (copy vkws logic).

- [ ] **Step 3: Failing BytesLruMap tests** then implement

- promote-on-get
- replace size delta
- evict LRU when over `maxBytes`
- `maxEntries`
- `setMaxBytes` shrink
- oversize reject (`set` returns false, map unchanged)
- `onEvict` called with key+value
- iterator LRU-first

Constructor opts and methods per spec. `set` returns `boolean`.

- [ ] **Step 4: Failing BlobBytesLedger tests** then implement (port vkws `_blob-bytes-ledger.unit.ts`):

- note/forget while hot
- `getTotal` rebuild
- **note during `listItems` await → retry, no stale assign**
- forget during list
- invalidate during list

- [ ] **Step 5: Export from barrel, run tests, commit**

```bash
pnpm exec vitest run packages/resource-cache
git add packages/resource-cache
git commit -m "$(cat <<'EOF'
feat(resource-cache): add bytes cap, BytesLruMap, and blob ledger

EOF
)"
```

---

### Task 6: `@yorozu/resource-cache` engine (row, drop, createResourceCache)

**Files:**
- Create: `packages/resource-cache/src/row.ts`
- Create: `packages/resource-cache/src/collection.ts`, `collection.unit.ts`
- Create: `packages/resource-cache/src/drop.ts`, `drop.unit.ts`
- Create: `packages/resource-cache/src/cache.ts`, `cache.unit.ts`
- Create: `packages/resource-cache/README.md`
- Modify: `packages/resource-cache/src/index.ts`

**Interfaces:**
- Consumes: `openMemoryDb` from `@yorozu/db`; Task 5 exports
- Produces: `ResourceRow`, `resourceCollectionDef`, `resourceSchema`, `BY_EVICT_INDEX`, `listEvictItems`, `attachBytesLedger`, `dropDelete`, `dropStripBlob`, `createResourceCache`

- [ ] **Step 1: Failing row + listEvictItems tests** using `openMemoryDb(resourceSchema("t", ["files"]))`. keysOnly + `lt: [cutoff]`; ledger totals after put/overwrite/delete; concurrent note during list via `attachBytesLedger`.

Implement `row.ts` + `collection.ts`.

`listEvictItems` maps scan hits: `indexKey` tuple → `{key: String(primaryKey), storedAt, bytes}`.

- [ ] **Step 2: Failing drop tests** then implement: `dropDelete` removes keys; `dropStripBlob` keeps row, `bytes === 0`, no blob; empty plan no-op.

- [ ] **Step 3: Failing createResourceCache tests** (spy `collection.scan` / `put`):

| Case | Expect |
| --- | --- |
| under cap | `getBytesTotal` path only; `scan` **not** called on `evict("bytes")` |
| over cap + strip | oldest blob gone, meta row remains |
| over cap + delete | oldest row gone |
| TTL | scan `by-evict` keysOnly `lt: [cutoff]` then drop |
| count cap | extra oldest rows dropped |
| put blob larger than cap | `collection.put` never called |
| `setCaps` shrink | immediate trim |
| L1 `onEvict` / `onDropped` | fired on bytes drop |
| `evictMetaEveryNPuts: 1` | TTL/count run after put |

Implement `cache.ts` evict body **exactly** as spec/sketch. Optional `log` via `makeLog(..., "yorozu-resource-cache")`. Flow `resource-evict` on bytes trim (`start`/`skip`/`done`).

- [ ] **Step 4: README** — port is `Collection`; host supplies driver; no product names; no IDB in this package.

- [ ] **Step 5: Tests + commit**

```bash
pnpm exec vitest run packages/resource-cache
git add packages/resource-cache
git commit -m "$(cat <<'EOF'
feat(resource-cache): add createResourceCache engine on Collection

EOF
)"
```

---

### Task 7: `@yorozu/outbox` store (memory + Collection adapter)

**Files:**
- Create: `packages/outbox/package.json`, `tsconfig.json`
- Create: `packages/outbox/src/types.ts`, `ids.ts`, `memory.ts`, `memory.unit.ts`
- Create: `packages/outbox/src/collection-store.ts`, `collection-store.unit.ts`
- Create: `packages/outbox/src/schema.ts`
- Create: `packages/outbox/src/index.ts` (partial)

**Interfaces:**
- Consumes: `@yorozu/db`, `@yorozu/log`, `@yorozu/utils`
- Produces: `OutboxEntry`, `OutboxStore`, `Clock`, `openMemoryOutbox`, `outboxCollectionDef`, `createOutboxStore`

- [ ] **Step 1: Scaffold** deps workspace `db`, `log`, `utils`.

- [ ] **Step 2: Failing memory contract tests** (port vkws `testing/outbox-test.ts` behaviors):

- empty claim
- enqueue defaults (`reservedTo: 0`, `attempts: 0`, no `failedAt`)
- FIFO + attempts increment on claim
- lease hold / expiry reclaim (inject `clock` with mutable `now`)
- `release` zeros `reservedTo`
- `updateAfterFailure`
- delete / deleteAll / count
- `markFailed` skipped by claim + `listFailed`
- `retry` clears failed
- `releaseUncounted` undoes attempt

Implement `openMemoryOutbox`.

- [ ] **Step 3: Failing Collection-backed tests** with `openMemoryDb` + `outboxCollectionDef("outbox")`. Same contract as Step 2. Plus: `markFailed` sets `reservedTo` to `Number.MAX_SAFE_INTEGER` so a `by-claim` scan with `lte: [now, MAX_SAFE_INTEGER]` does not return it as due if we also skip `failedAt` — assert `claim` returns null while `get` still finds the row.

Implement `createOutboxStore` using `db.transact([col.name], "rw", ...)` for claim.

- [ ] **Step 4: Export, tests, commit**

```bash
pnpm exec vitest run packages/outbox
git add packages/outbox
git commit -m "$(cat <<'EOF'
feat(outbox): add OutboxStore memory and Collection adapters

EOF
)"
```

---

### Task 8: `@yorozu/outbox` worker

**Files:**
- Create: `packages/outbox/src/worker.ts`, `worker.unit.ts`, `prune.ts`, `prune.unit.ts`
- Create: `packages/outbox/README.md`
- Modify: `packages/outbox/src/index.ts`

**Interfaces:**
- Consumes: Task 7 store
- Produces: `OutboxHandler`, `OutboxWorker`, `pruneOutboxFailed`

- [ ] **Step 1: Failing prune tests** then implement (age 90d / count 200; never deletes non-failed). Clock injectable.

- [ ] **Step 2: Failing worker tests** (port vkws `worker.unit.ts` intent) with fake timers + injected clock:

- success → delete
- backoff writes future `reservedTo` (not `release`)
- exponential delay `min(base * 2^(attempts-1), cap)`
- max attempts + `rollback` → delete
- `onExhausted` → `markFailed`
- non-retryable → exhaust immediately
- offline → `releaseUncounted` + skip
- unknown type → delete + `never-happen`
- pause/resume
- LDD: `createTestLog` + `makeLog` + `expectFlowStory(..., "outbox-process", ["start","done"])` on success; `["start","retry"]` on backoff; `["start","error"]` on exhaust
- `log` omitted → silent logger, span still runs `process`

Defaults: poll 2000, lease 30000, maxAttempts 5, retryBase 1000, retryCap 30000. Jitter 0–20% subtractive.

Use `@yorozu/utils` `timers` for the interval. Fake timers in tests (`vi.useFakeTimers()`).

- [ ] **Step 3: Implement worker** (vkws `_tick` / `_exhaust`). `this.log = makeLog(opts.log ?? makeSilentLog(), "yorozu-outbox")`.

- [ ] **Step 4: README** — inject store, clock, logger, handlers; messenger keeps SyncManager / durability / domain handlers.

- [ ] **Step 5: Tests + commit**

```bash
pnpm exec vitest run packages/outbox
git add packages/outbox
git commit -m "$(cat <<'EOF'
feat(outbox): add OutboxWorker claim/lease/retry engine

EOF
)"
```

---

### Task 9: Desktop migration + perf docs

**Files:**
- Create: `/Users/kiwidancebad/Desktop/wsm-log.md`
- Create: `/Users/kiwidancebad/Desktop/wsm-db.md`
- Create: `/Users/kiwidancebad/Desktop/wsm-resource-cache.md`
- Create: `/Users/kiwidancebad/Desktop/wsm-outbox.md`
- Create: `/Users/kiwidancebad/Desktop/perf-wsm-media-pipeline.md`
- Create: `/Users/kiwidancebad/Desktop/perf-wsm-history-viewport.md`
- Create: `/Users/kiwidancebad/Desktop/perf-wsm-writes.md`
- Create: `/Users/kiwidancebad/Desktop/perf-wsm-download-queue.md`

**Interfaces:**
- Consumes: landed package APIs (read `packages/*/src/index.ts` and READMEs — quote real exports, do not invent)
- Produces: Desktop markdown only (not committed to yorozu unless already tracking Desktop — **do not git add Desktop files**)

- [ ] **Step 1: Write `wsm-log.md`** — replace vkws `utils/log.ts` / `test-log.ts` with `@yorozu/log`. `makeLog` / `createTestLog` / `expectFlowStory`. Keep `LDD_FLOWS` catalog in messenger. File-by-file list.

- [ ] **Step 2: Write `wsm-db.md`** — path A: wrap existing files/avatars (and keyed repos) as `Collection` without a second `indexedDB.open`. Later: `createIdbDriver(messengerSchema)` / `createSqliteDriver({filename})`. Delete six IDB keyed clones. Schema object. `flush` vs `writeLater`. What stays custom (chat-history, folders, auth-keys). sqlite composition root.

- [ ] **Step 3: Write `wsm-resource-cache.md`** — swap persist peels to `createResourceCache`; files `dropStripBlob`, avatars `dropDelete`; delete `bytes-capacity-evict.ts` and `_blob-bytes-ledger.ts`. Keep `createCachedResource`, preview quality, object URLs, user-settings GB. L1 `BytesLruMap` + revoke `onEvict` (fixes files L1 leak).

- [ ] **Step 4: Write `wsm-outbox.md`** — replace `CoreOutboxWorker` + repo implementations. Keep SyncManager, status-notify, `withDurableWrite`, domain handlers. Clock injection. `reservedTo = MAX` on markFailed. Tests: reuse `testOutboxRepository` against `openMemoryOutbox` / Collection adapter.

- [ ] **Step 5: Write perf docs** with Telegram evidence (path + symbol), current vkws path, numbered change steps, expected benefit:

`perf-wsm-media-pipeline.md`: telegram-tt `mediaLoader.ts` (`fetch`, `getProgressiveUrl`, `MEDIA_CACHE_MAX_BYTES` 512KB), `cacheApi.ts` (`LAST_ACCESS_HEADER`, cleanup without body), `serviceWorker/progressive.ts` Range 206; iOS `MediaBox` representations; vkws single best `previewBlob`, `storedAt` on write not access, `getAllMeta` value cursor. Changes: representation keys, progressive URL, index-only eviction (already in pkg), access-time optional, do not mass-seed L1 blobs.

`perf-wsm-history-viewport.md`: tt `MESSAGE_LIST_SLICE` 40–60, `reduceMessages` persist viewport only; vkws `getAllForChat` full `getAll` + prefix. Add `by-chat` index + `scan`; paint window already exists — persist only painted + edges.

`perf-wsm-writes.md`: tt `IdbStore.setMany`, 5s throttle + idle; vkws `writeLater` no coalescing, one tx per files put. Use Collection `putMany` + flush coalesce; idle/`visibilitychange`/`beforeunload` flush; never await durable write before optimistic paint.

`perf-wsm-download-queue.md`: tt `dcBandwithManager.ts` Foreman, SW `FilePartQueue` 8; vkws unbounded preview fetches. Scheduler: visible > preload > background; abort on leave viewport.

- [ ] **Step 6: Commit only yorozu-side notes if any.** Desktop files stay on Desktop. If nothing in-repo changed, skip commit.

If you add a one-line pointer in `packages/db/README.md` to the Desktop docs, that is optional — prefer not to. No commit if no repo files changed.

---

## Self-review (plan vs spec)

- log / db / db-idb / db-sqlite / resource-cache / outbox / Desktop docs each have a task
- better-sqlite3 thin wrapper is Task 4 (`wrapBetterSqlite3` + `createSqliteDriver`)
- `keysOnly` correctness, prefix bounds, optional logger, Clock, BytesLruMap onEvict, markFailed reservedTo MAX are in tasks
- No vkws migration implementation
- No `createCachedResource` package
