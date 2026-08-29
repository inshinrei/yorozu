import { unlink } from "node:fs/promises"
import Database from "better-sqlite3"
import {
    compareIndexKey,
    inRange,
    type Collection,
    type CollectionDef,
    type Db,
    type DbDriver,
    type DbSchema,
    type IndexDef,
    type IndexKey,
    type PutOpts,
    type ScanBound,
    type ScanHit,
    type TxMode,
} from "@yorozu/db"
import { makeLog, makeSilentLog, type Logger } from "@yorozu/log"
import { wrapBetterSqlite3, type SqliteHandle } from "./handle"

type Row = Record<string, unknown>

type PendingWrite = {
    row: Row
    pk: string
    payloadJson: string
    blobs: Map<string, Buffer>
    indexBinds: unknown[]
}

type Pending = Map<string, Map<string, PendingWrite>>

let IDENT_RE = /^[A-Za-z0-9_-]+$/
let ISSUE_KEY = "yorozu-db-sqlite"

function reportError(log: Logger, err: unknown): void {
    if (err instanceof Error) log.error(err)
    else log.warn("never-happen", { err })
}

function quoteIdent(name: string): string {
    if (!IDENT_RE.test(name)) throw new Error(`illegal identifier: ${name}`)
    return `"${name}"`
}

function validateSchema(schema: DbSchema): void {
    for (let col of schema.collections) {
        quoteIdent(col.name)
        for (let idx of col.indexes ?? []) quoteIdent(idx.name)
    }
}

function indexFields(keyPath: string | readonly string[]): string[] {
    return typeof keyPath === "string" ? [keyPath] : [...keyPath]
}

function indexColId(indexName: string, i: number): string {
    return `${indexName}__${i}`
}

function allIndexColIds(def: CollectionDef): string[] {
    let out: string[] = []
    for (let idx of def.indexes ?? []) {
        let n = indexFields(idx.keyPath).length
        for (let i = 0; i < n; i++) out.push(indexColId(idx.name, i))
    }
    return out
}

function isScalarKey(value: unknown): value is string | number {
    return typeof value === "string" || (typeof value === "number" && !Number.isNaN(value))
}

function projectIndexKey(row: Row, keyPath: string | readonly string[]): IndexKey | undefined {
    if (typeof keyPath === "string") {
        let value = row[keyPath]
        if (!isScalarKey(value)) return undefined
        return value
    }
    let parts: Array<string | number> = []
    for (let field of keyPath) {
        let value = row[field]
        if (!isScalarKey(value)) return undefined
        parts.push(value)
    }
    return parts
}

function primaryKeyOf(row: Row, keyPath: string): string {
    let raw = row[keyPath]
    if (raw === undefined || raw === null) throw new Error(`missing primary key field: ${keyPath}`)
    return String(raw)
}

function withStringPk<T extends Row>(row: T, keyPath: string, pk: string): T {
    if (row[keyPath] === pk) return row
    return { ...row, [keyPath]: pk }
}

function indexKeyPath(def: CollectionDef, name: string): string | readonly string[] {
    if (name === "__pk") return def.keyPath
    let idx = (def.indexes ?? []).find((item) => item.name === name)
    if (!idx) throw new Error(`unknown index: ${name}`)
    return idx.keyPath
}

function isBlobish(value: unknown): boolean {
    if (typeof Blob !== "undefined" && value instanceof Blob) return true
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true
    if (value instanceof Uint8Array) return true
    return false
}

async function toBytes(value: unknown): Promise<Buffer> {
    if (Buffer.isBuffer(value)) return value
    if (value instanceof ArrayBuffer) return Buffer.from(value)
    if (value instanceof Uint8Array) return Buffer.from(value)
    if (typeof Blob !== "undefined" && value instanceof Blob) {
        return Buffer.from(await value.arrayBuffer())
    }
    throw new Error("expected blob field")
}

function rehydrate(data: Buffer): Blob | Uint8Array {
    let bytes = Uint8Array.from(data)
    if (typeof Blob === "function") return new Blob([bytes])
    return bytes
}

async function splitRow(row: Row): Promise<{ payload: Row; blobs: Map<string, Buffer> }> {
    let payload: Row = {}
    let blobs = new Map<string, Buffer>()
    for (let [key, value] of Object.entries(row)) {
        if (isBlobish(value)) blobs.set(key, await toBytes(value))
        else payload[key] = value
    }
    return { payload, blobs }
}

function indexBinds(row: Row, def: CollectionDef): unknown[] {
    let values: unknown[] = []
    for (let idx of def.indexes ?? []) {
        for (let field of indexFields(idx.keyPath)) {
            let value = row[field]
            values.push(isScalarKey(value) ? value : null)
        }
    }
    return values
}

function lexSql(
    cols: string[],
    parts: Array<string | number>,
    wantLess: boolean,
    inclusive: boolean,
): { sql: string; params: unknown[] } {
    let n = cols.length
    let m = parts.length
    let clauses: string[] = []
    let params: unknown[] = []
    let shared = Math.min(n, m)

    for (let i = 0; i < shared; i++) {
        let terms: string[] = []
        for (let j = 0; j < i; j++) {
            terms.push(`${cols[j]} = ?`)
            params.push(parts[j])
        }
        terms.push(`${cols[i]} ${wantLess ? "<" : ">"} ?`)
        params.push(parts[i])
        clauses.push(`(${terms.join(" AND ")})`)
    }

    let eqTerms: string[] = []
    let eqParams: unknown[] = []
    for (let i = 0; i < shared; i++) {
        eqTerms.push(`${cols[i]} = ?`)
        eqParams.push(parts[i])
    }

    if (n === m) {
        if (inclusive && eqTerms.length > 0) {
            clauses.push(`(${eqTerms.join(" AND ")})`)
            params.push(...eqParams)
        }
    } else if (n > m) {
        if (!wantLess) {
            if (eqTerms.length > 0) {
                clauses.push(`(${eqTerms.join(" AND ")})`)
                params.push(...eqParams)
            } else {
                clauses.push("1")
            }
        }
    } else if (wantLess) {
        if (eqTerms.length > 0) {
            clauses.push(`(${eqTerms.join(" AND ")})`)
            params.push(...eqParams)
        } else {
            clauses.push("1")
        }
    }

    if (clauses.length === 0) return { sql: "0", params: [] }
    return { sql: `(${clauses.join(" OR ")})`, params }
}

function edgeSql(
    cols: string[],
    storedIsArray: boolean,
    key: IndexKey,
    wantLess: boolean,
    inclusive: boolean,
): { sql: string; params: unknown[] } {
    let keyIsArray = Array.isArray(key)
    if (storedIsArray !== keyIsArray) {
        if (storedIsArray) {
            return wantLess ? { sql: "0", params: [] } : { sql: "1", params: [] }
        }
        return wantLess ? { sql: "1", params: [] } : { sql: "0", params: [] }
    }
    let parts: Array<string | number> = Array.isArray(key) ? [...key] : [key]
    return lexSql(cols, parts, wantLess, inclusive)
}

function boundSql(cols: string[], storedIsArray: boolean, bound: ScanBound): { sql: string; params: unknown[] } {
    let parts: string[] = []
    let params: unknown[] = []
    let add = (key: IndexKey | undefined, wantLess: boolean, inclusive: boolean): void => {
        if (key === undefined) return
        let frag = edgeSql(cols, storedIsArray, key, wantLess, inclusive)
        parts.push(frag.sql)
        params.push(...frag.params)
    }
    add(bound.gt, false, false)
    add(bound.gte, false, true)
    add(bound.lt, true, false)
    add(bound.lte, true, true)
    if (parts.includes("0")) return { sql: "0", params: [] }
    let rest = parts.filter((p) => p !== "1")
    if (rest.length === 0) return { sql: "1", params: [] }
    return { sql: rest.join(" AND "), params }
}

function applySchema(handle: SqliteHandle, schema: DbSchema): void {
    for (let col of schema.collections) {
        let table = quoteIdent(col.name)
        let extra: string[] = []
        for (let id of allIndexColIds(col)) extra.push(quoteIdent(id))
        let extraSql = extra.length === 0 ? "" : extra.map((c) => `,\n  ${c}`).join("")
        handle.exec(
            `CREATE TABLE IF NOT EXISTS ${table} (\n  pk TEXT PRIMARY KEY NOT NULL,\n  payload TEXT NOT NULL${extraSql}\n)`,
        )
        handle.exec(
            `CREATE TABLE IF NOT EXISTS ${quoteIdent(`${col.name}__blobs`)} (\n  pk TEXT NOT NULL,\n  field TEXT NOT NULL,\n  data BLOB NOT NULL,\n  PRIMARY KEY (pk, field)\n)`,
        )
        for (let idx of col.indexes ?? []) {
            let cols = indexFields(idx.keyPath).map((_, i) => quoteIdent(indexColId(idx.name, i)))
            let unique = idx.unique === true ? "UNIQUE " : ""
            handle.exec(
                `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(`${col.name}_${idx.name}`)} ON ${table} (${cols.join(", ")})`,
            )
        }
    }
}

async function unlinkIfExists(path: string): Promise<void> {
    try {
        await unlink(path)
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
}

class SerialQueue {
    protected _tail: Promise<void> = Promise.resolve()

    with<R>(fn: () => Promise<R>): Promise<R> {
        let run = this._tail.then(() => fn())
        this._tail = run.then(
            () => undefined,
            () => undefined,
        )
        return run
    }
}

class NestedTxDb implements Db {
    constructor(
        protected _inner: Db,
        protected _unlocked: (name: string) => Collection<Row>,
        protected _flushUnlocked: () => void,
    ) {}

    get schema(): DbSchema {
        return this._inner.schema
    }

    collection<T extends Row>(name: string): Collection<T> {
        return this._unlocked(name) as Collection<T>
    }

    transact<R>(_names: readonly string[], _mode: TxMode, _fn: (db: Db) => Promise<R>): Promise<R> {
        return Promise.reject(new Error("nested transact is not supported"))
    }

    flush(): Promise<void> {
        this._flushUnlocked()
        return Promise.resolve()
    }

    close(): Promise<void> {
        return this._inner.close()
    }
}

class GatedCollection<T extends Row> implements Collection<T> {
    readonly name: string

    constructor(
        protected _inner: SqliteCollection<T>,
        protected _lock: SerialQueue,
    ) {
        this.name = _inner.name
    }

    get(key: string): Promise<T | null> {
        return this._lock.with(() => this._inner.get(key))
    }

    getMany(keys: readonly string[]): Promise<Array<T | null>> {
        return this._lock.with(() => this._inner.getMany(keys))
    }

    put(row: T, opts?: PutOpts): Promise<void> {
        return this._lock.with(() => this._inner.put(row, opts))
    }

    putMany(rows: readonly T[], opts?: PutOpts): Promise<void> {
        return this._lock.with(() => this._inner.putMany(rows, opts))
    }

    delete(keys: readonly string[]): Promise<void> {
        return this._lock.with(() => this._inner.delete(keys))
    }

    clear(): Promise<void> {
        return this._lock.with(() => this._inner.clear())
    }

    count(): Promise<number> {
        return this._lock.with(() => this._inner.count())
    }

    getAll(): Promise<T[]> {
        return this._lock.with(() => this._inner.getAll())
    }

    scan(index: string, bound?: ScanBound): Promise<Array<ScanHit<T>>> {
        return this._lock.with(() => this._inner.scan(index, bound))
    }
}

class SqliteCollection<T extends Row> implements Collection<T> {
    readonly name: string
    protected _def: CollectionDef
    protected _keyPath: string
    protected _indexes: Map<string, IndexDef>
    protected _handle: SqliteHandle
    protected _pending: Pending
    protected _inSqlTx: { value: boolean }
    protected _table: string
    protected _blobTable: string
    protected _indexColIds: string[]

    constructor(def: CollectionDef, handle: SqliteHandle, pending: Pending, inSqlTx: { value: boolean }) {
        this.name = def.name
        this._def = def
        this._keyPath = def.keyPath
        this._indexes = new Map()
        for (let index of def.indexes ?? []) this._indexes.set(index.name, index)
        this._handle = handle
        this._pending = pending
        this._inSqlTx = inSqlTx
        this._table = quoteIdent(def.name)
        this._blobTable = quoteIdent(`${def.name}__blobs`)
        this._indexColIds = allIndexColIds(def)
    }

    protected _colPending(): Map<string, PendingWrite> | undefined {
        return this._pending.get(this.name)
    }

    protected _ensurePending(): Map<string, PendingWrite> {
        let map = this._pending.get(this.name)
        if (!map) {
            map = new Map()
            this._pending.set(this.name, map)
        }
        return map
    }

    protected _writeTx(fn: () => void): void {
        if (this._inSqlTx.value) {
            fn()
            return
        }
        this._handle.transaction(fn)
    }

    protected async _prepareWrite(row: T): Promise<PendingWrite> {
        let pk = primaryKeyOf(row, this._keyPath)
        let stored = withStringPk(row, this._keyPath, pk)
        let split = await splitRow(stored)
        return {
            row: stored,
            pk,
            payloadJson: JSON.stringify(split.payload),
            blobs: split.blobs,
            indexBinds: indexBinds(stored, this._def),
        }
    }

    insertWrite(write: PendingWrite): void {
        let cols = ["pk", "payload", ...this._indexColIds.map(quoteIdent)]
        let ph = cols.map(() => "?").join(", ")
        this._handle
            .prepare(`INSERT OR REPLACE INTO ${this._table} (${cols.join(", ")}) VALUES (${ph})`)
            .run([write.pk, write.payloadJson, ...write.indexBinds])
        this._handle.prepare(`DELETE FROM ${this._blobTable} WHERE pk = ?`).run([write.pk])
        if (write.blobs.size === 0) return
        let ins = this._handle.prepare(`INSERT INTO ${this._blobTable} (pk, field, data) VALUES (?, ?, ?)`)
        for (let [field, data] of write.blobs) ins.run([write.pk, field, data])
    }

    protected _attachBlobs(byPk: Map<string, Row>, pks: readonly string[]): void {
        if (pks.length === 0) return
        let ph = pks.map(() => "?").join(", ")
        let blobRows = this._handle
            .prepare(`SELECT pk, field, data FROM ${this._blobTable} WHERE pk IN (${ph})`)
            .all(pks)
        for (let blobRow of blobRows) {
            let pk = String(blobRow.pk)
            let row = byPk.get(pk)
            if (!row) continue
            row[String(blobRow.field)] = rehydrate(blobRow.data as Buffer)
        }
    }

    async get(key: string): Promise<T | null> {
        let pending = this._colPending()?.get(key)
        if (pending !== undefined) return pending.row as T
        let found = this._handle.prepare(`SELECT payload FROM ${this._table} WHERE pk = ?`).get([key]) as
            | { payload: string }
            | undefined
        if (!found) return null
        let row = JSON.parse(found.payload) as Row
        this._attachBlobs(new Map([[key, row]]), [key])
        return row as T
    }

    async getMany(keys: readonly string[]): Promise<Array<T | null>> {
        if (keys.length === 0) return []
        let pending = this._colPending()
        let need: string[] = []
        let seen = new Set<string>()
        for (let key of keys) {
            if (pending?.has(key) || seen.has(key)) continue
            seen.add(key)
            need.push(key)
        }
        let loaded = new Map<string, T>()
        if (need.length > 0) {
            let ph = need.map(() => "?").join(", ")
            let rows = this._handle.prepare(`SELECT pk, payload FROM ${this._table} WHERE pk IN (${ph})`).all(need)
            let byPk = new Map<string, Row>()
            for (let r of rows) {
                byPk.set(String(r.pk), JSON.parse(String(r.payload)) as Row)
            }
            this._attachBlobs(byPk, need)
            for (let [pk, row] of byPk) loaded.set(pk, row as T)
        }
        return keys.map((key) => {
            let hit = pending?.get(key)
            if (hit) return hit.row as T
            return loaded.get(key) ?? null
        })
    }

    async put(row: T, opts?: PutOpts): Promise<void> {
        let write = await this._prepareWrite(row)
        if ((opts?.flush ?? "now") === "batch") {
            this._ensurePending().set(write.pk, write)
            return
        }
        this._colPending()?.delete(write.pk)
        this._writeTx(() => this.insertWrite(write))
    }

    async putMany(rows: readonly T[], opts?: PutOpts): Promise<void> {
        if (rows.length === 0) return
        let writes: PendingWrite[] = []
        for (let row of rows) writes.push(await this._prepareWrite(row))
        if ((opts?.flush ?? "now") === "batch") {
            let pending = this._ensurePending()
            for (let write of writes) pending.set(write.pk, write)
            return
        }
        let live = this._colPending()
        this._writeTx(() => {
            for (let write of writes) {
                live?.delete(write.pk)
                this.insertWrite(write)
            }
        })
    }

    async delete(keys: readonly string[]): Promise<void> {
        let pending = this._colPending()
        if (pending) {
            for (let key of keys) pending.delete(key)
        }
        if (keys.length === 0) return
        let ph = keys.map(() => "?").join(", ")
        this._writeTx(() => {
            this._handle.prepare(`DELETE FROM ${this._table} WHERE pk IN (${ph})`).run(keys)
            this._handle.prepare(`DELETE FROM ${this._blobTable} WHERE pk IN (${ph})`).run(keys)
        })
    }

    async clear(): Promise<void> {
        this._pending.delete(this.name)
        this._writeTx(() => {
            this._handle.exec(`DELETE FROM ${this._table}`)
            this._handle.exec(`DELETE FROM ${this._blobTable}`)
        })
    }

    async count(): Promise<number> {
        let pending = this._colPending()
        if (!pending || pending.size === 0) {
            let row = this._handle.prepare(`SELECT COUNT(*) AS c FROM ${this._table}`).get() as { c: number }
            return row.c
        }
        let rows = this._handle.prepare(`SELECT pk FROM ${this._table}`).all() as Array<{ pk: string }>
        let keys = new Set(rows.map((r) => String(r.pk)))
        for (let pk of pending.keys()) keys.add(pk)
        return keys.size
    }

    async getAll(): Promise<T[]> {
        let rows = this._handle.prepare(`SELECT pk, payload FROM ${this._table}`).all() as Array<{
            pk: string
            payload: string
        }>
        let byPk = new Map<string, Row>()
        for (let r of rows) byPk.set(String(r.pk), JSON.parse(r.payload) as Row)
        this._attachBlobs(byPk, [...byPk.keys()])
        let pending = this._colPending()
        if (pending) {
            for (let [pk, write] of pending) byPk.set(pk, write.row)
        }
        let entries = [...byPk.entries()]
        entries.sort((a, b) => compareIndexKey(a[0], b[0]))
        return entries.map(([, row]) => row as T)
    }

    async scan(index: string, bound: ScanBound = {}): Promise<Array<ScanHit<T>>> {
        if (index !== "__pk" && !this._indexes.has(index)) throw new Error(`unknown index: ${index}`)
        let keysOnly = bound.keysOnly === true
        let storedIsArray = false
        let rawCols: string[] = []
        let cols: string[] = []
        if (index === "__pk") {
            rawCols = ["pk"]
            cols = [quoteIdent("pk")]
        } else {
            let idx = this._indexes.get(index)!
            storedIsArray = Array.isArray(idx.keyPath)
            rawCols = indexFields(idx.keyPath).map((_, i) => indexColId(index, i))
            cols = rawCols.map(quoteIdent)
        }

        let pending = this._colPending()
        let hits: Array<ScanHit<T>> = []
        let frag = boundSql(cols, storedIsArray, bound)
        if (frag.sql !== "0") {
            let selectList =
                index === "__pk"
                    ? keysOnly
                        ? ["pk"]
                        : ["pk", "payload"]
                    : keysOnly
                      ? ["pk", ...cols]
                      : ["pk", "payload", ...cols]
            let whereParts: string[] = []
            if (index !== "__pk") {
                for (let col of cols) whereParts.push(`${col} IS NOT NULL`)
            }
            let params = [...frag.params]
            if (frag.sql !== "1") whereParts.push(frag.sql)
            let where = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : ""
            let order = `ORDER BY ${cols.join(", ")}${index === "__pk" ? "" : ", pk"}`
            let sql = `SELECT ${selectList.join(", ")} FROM ${this._table} ${where} ${order}`
            let rows = this._handle.prepare(sql).all(params)
            let valueByPk = new Map<string, Row>()
            for (let r of rows) {
                let pk = String(r.pk)
                let indexKey: IndexKey
                if (index === "__pk") indexKey = pk
                else if (storedIsArray) indexKey = rawCols.map((c) => r[c] as string | number)
                else indexKey = r[rawCols[0]!] as string | number
                if (!inRange(indexKey, bound)) continue
                if (keysOnly) {
                    hits.push({ primaryKey: pk, indexKey })
                } else {
                    let value = JSON.parse(String(r.payload)) as Row
                    valueByPk.set(pk, value)
                    hits.push({ primaryKey: pk, indexKey, value: value as T })
                }
            }
            if (!keysOnly && valueByPk.size > 0) this._attachBlobs(valueByPk, [...valueByPk.keys()])
        }
        if (pending && pending.size > 0) hits = this._mergePending(index, bound, hits, pending)
        hits.sort((a, b) => {
            let c = compareIndexKey(a.indexKey, b.indexKey)
            if (c !== 0) return c
            return compareIndexKey(a.primaryKey, b.primaryKey)
        })
        if (bound.limit !== undefined) hits = hits.slice(0, Math.max(0, bound.limit))
        return hits
    }

    protected _mergePending(
        index: string,
        bound: ScanBound,
        hits: Array<ScanHit<T>>,
        pending: Map<string, PendingWrite>,
    ): Array<ScanHit<T>> {
        let replaced = new Set(pending.keys())
        let out = hits.filter((h) => !replaced.has(h.primaryKey))
        let keyPath = indexKeyPath(this._def, index)
        for (let [pk, write] of pending) {
            let indexKey: IndexKey | undefined = index === "__pk" ? pk : projectIndexKey(write.row, keyPath)
            if (indexKey === undefined) continue
            if (!inRange(indexKey, bound)) continue
            if (bound.keysOnly) out.push({ primaryKey: pk, indexKey })
            else out.push({ primaryKey: pk, indexKey, value: write.row as T })
        }
        out.sort((a, b) => {
            let c = compareIndexKey(a.indexKey, b.indexKey)
            if (c !== 0) return c
            return compareIndexKey(a.primaryKey, b.primaryKey)
        })
        return out
    }
}

class SqliteDb implements Db {
    readonly schema: DbSchema
    protected _handle: SqliteHandle
    protected _collections: Map<string, SqliteCollection<Row>>
    protected _gated: Map<string, GatedCollection<Row>>
    protected _pending: Pending = new Map()
    protected _lock: SerialQueue = new SerialQueue()
    protected _inSqlTx = { value: false }
    protected _txView: Db
    protected _onClose: () => void
    protected _closed = false

    constructor(schema: DbSchema, handle: SqliteHandle, onClose: () => void) {
        this.schema = schema
        this._handle = handle
        this._onClose = onClose
        this._collections = new Map()
        this._gated = new Map()
        this._txView = new NestedTxDb(
            this,
            (name) => {
                let col = this._collections.get(name)
                if (!col) throw new Error(`unknown collection: ${name}`)
                return col
            },
            () => this._flushPending(),
        )
        for (let def of schema.collections) {
            let col = new SqliteCollection(def, handle, this._pending, this._inSqlTx)
            this._collections.set(def.name, col)
            this._gated.set(def.name, new GatedCollection(col, this._lock))
        }
    }

    collection<T extends Row>(name: string): Collection<T> {
        let col = this._gated.get(name)
        if (!col) throw new Error(`unknown collection: ${name}`)
        return col as Collection<T>
    }

    transact<R>(names: readonly string[], _mode: TxMode, fn: (db: Db) => Promise<R>): Promise<R> {
        for (let name of names) {
            if (!this._collections.has(name)) throw new Error(`unknown collection: ${name}`)
        }
        return this._lock.with(async () => {
            this._handle.exec("BEGIN IMMEDIATE")
            this._inSqlTx.value = true
            try {
                let result = await fn(this._txView)
                this._flushPending()
                this._handle.exec("COMMIT")
                return result
            } catch (err) {
                try {
                    this._handle.exec("ROLLBACK")
                } catch {
                    // not in a transaction
                }
                throw err
            } finally {
                this._inSqlTx.value = false
            }
        })
    }

    flush(): Promise<void> {
        return this._lock.with(async () => {
            this._flushPending()
        })
    }

    async close(): Promise<void> {
        if (this._closed) return
        this._closed = true
        try {
            this._flushPending()
        } finally {
            this._handle.close()
            this._onClose()
        }
    }

    protected _flushPending(): void {
        let snapshot: Array<[string, PendingWrite[]]> = []
        for (let [name, rows] of this._pending) {
            if (rows.size === 0) continue
            snapshot.push([name, [...rows.values()]])
        }
        if (snapshot.length === 0) return
        let run = (): void => {
            for (let [name, writes] of snapshot) {
                let col = this._collections.get(name)
                if (!col) continue
                for (let write of writes) col.insertWrite(write)
            }
        }
        if (this._inSqlTx.value) run()
        else this._handle.transaction(run)
        for (let [name, writes] of snapshot) {
            let live = this._pending.get(name)
            if (!live) continue
            for (let write of writes) {
                if (live.get(write.pk) === write) live.delete(write.pk)
            }
        }
    }
}

class SqliteDriver implements DbDriver {
    protected log: Logger
    protected _filename: string
    protected _native: typeof Database
    protected _conns: Set<SqliteDb> = new Set()

    constructor(opts: { filename: string; native?: typeof Database; log?: Logger }) {
        this.log = makeLog(opts.log ?? makeSilentLog(), ISSUE_KEY)
        this._filename = opts.filename
        this._native = opts.native ?? Database
    }

    async open(schema: DbSchema): Promise<Db> {
        let raw: Database.Database | undefined
        try {
            validateSchema(schema)
            let Native = this._native
            raw = new Native(this._filename)
            try {
                raw.pragma("journal_mode = WAL")
            } catch {
                // WAL is unsupported on :memory:
            }
            let handle = wrapBetterSqlite3(raw)
            applySchema(handle, schema)
            let db = new SqliteDb(schema, handle, () => {
                this._conns.delete(db)
            })
            this._conns.add(db)
            return db
        } catch (err) {
            try {
                raw?.close()
            } catch {
                // already closed
            }
            reportError(this.log, err)
            throw err
        }
    }

    async drop(_schema: DbSchema): Promise<void> {
        try {
            for (let db of [...this._conns]) await db.close()
            if (this._filename === ":memory:") return
            await unlinkIfExists(this._filename)
            await unlinkIfExists(`${this._filename}-wal`)
            await unlinkIfExists(`${this._filename}-shm`)
        } catch (err) {
            reportError(this.log, err)
            throw err
        }
    }
}

export function createSqliteDriver(opts: { filename: string; native?: typeof Database; log?: Logger }): DbDriver {
    return new SqliteDriver(opts)
}
