import { AsyncLocalStorage } from "node:async_hooks"
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
import { toIdbKeyRange } from "./range"

type Row = Record<string, unknown>
type PendingEntry = { row: Row; seq: number }
type Pending = Map<string, Map<string, PendingEntry>>
type SeqBox = { n: number }

function nextSeq(box: SeqBox): number {
    box.n++
    return box.n
}

function reportError(log: Logger, err: unknown): void {
    if (err instanceof Error) log.error(err)
    else log.warn("never-happen", { err })
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

function runTx(
    db: IDBDatabase,
    names: readonly string[],
    mode: IDBTransactionMode,
    exec: (tx: IDBTransaction) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        let tx: IDBTransaction
        try {
            tx = db.transaction([...names], mode)
        } catch (err) {
            reject(err)
            return
        }
        let done = false
        const fail = (err: unknown): void => {
            if (done) return
            done = true
            reject(err)
        }
        tx.oncomplete = () => {
            if (done) return
            done = true
            resolve()
        }
        tx.onerror = () => fail(tx.error ?? new Error("idb transaction failed"))
        tx.onabort = () => fail(tx.error ?? new Error("idb transaction aborted"))
        try {
            exec(tx)
        } catch (err) {
            fail(err)
            try {
                tx.abort()
            } catch {
                // already failed
            }
        }
    })
}

function applySchema(db: IDBDatabase, tx: IDBTransaction, schema: DbSchema): void {
    for (let col of schema.collections) {
        let store: IDBObjectStore
        if (db.objectStoreNames.contains(col.name)) {
            store = tx.objectStore(col.name)
        } else {
            store = db.createObjectStore(col.name, { keyPath: col.keyPath })
        }
        for (let idx of col.indexes ?? []) {
            if (store.indexNames.contains(idx.name)) continue
            let keyPath: string | string[] = typeof idx.keyPath === "string" ? idx.keyPath : [...idx.keyPath]
            store.createIndex(idx.name, keyPath, { unique: idx.unique === true })
        }
    }
}

function openIdb(factory: IDBFactory, name: string, schema: DbSchema, log: Logger): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        let settled = false
        const succeed = (db: IDBDatabase): void => {
            if (settled) return
            settled = true
            resolve(db)
        }
        const fail = (err: unknown): void => {
            if (settled) return
            settled = true
            reportError(log, err)
            reject(err)
        }
        let req: IDBOpenDBRequest
        try {
            req = factory.open(name, schema.version)
        } catch (err) {
            fail(err)
            return
        }
        req.onupgradeneeded = () => {
            try {
                let db = req.result
                let tx = req.transaction
                if (!tx) throw new Error("indexedDB upgrade has no transaction")
                applySchema(db, tx, schema)
            } catch (err) {
                try {
                    req.transaction?.abort()
                } catch {
                    // already failed
                }
                fail(err)
            }
        }
        req.onblocked = () => {
            // wait — live connections close on versionchange
        }
        req.onsuccess = () => succeed(req.result)
        req.onerror = () => fail(req.error ?? new Error("indexedDB open failed"))
    })
}

function deleteIdb(factory: IDBFactory, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let req = factory.deleteDatabase(name)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error ?? new Error("indexedDB deleteDatabase failed"))
        req.onblocked = () => {
            // wait until remaining connections close
        }
    })
}

class WriteGuardCollection<T extends Row> implements Collection<T> {
    readonly name: string

    constructor(
        protected _inner: Collection<T>,
        protected _mode: { value: TxMode | null },
    ) {
        this.name = _inner.name
    }

    protected _assertWritable(): void {
        if (this._mode.value === "r") throw new Error("write is not allowed in a read-only transact")
    }

    get(key: string): Promise<T | null> {
        return this._inner.get(key)
    }

    getMany(keys: readonly string[]): Promise<Array<T | null>> {
        return this._inner.getMany(keys)
    }

    async put(row: T, opts?: PutOpts): Promise<void> {
        this._assertWritable()
        await this._inner.put(row, opts)
    }

    async putMany(rows: readonly T[], opts?: PutOpts): Promise<void> {
        this._assertWritable()
        await this._inner.putMany(rows, opts)
    }

    async delete(keys: readonly string[]): Promise<void> {
        this._assertWritable()
        await this._inner.delete(keys)
    }

    async clear(): Promise<void> {
        this._assertWritable()
        await this._inner.clear()
    }

    count(): Promise<number> {
        return this._inner.count()
    }

    getAll(): Promise<T[]> {
        return this._inner.getAll()
    }

    scan(index: string, bound?: ScanBound): Promise<Array<ScanHit<T>>> {
        return this._inner.scan(index, bound)
    }
}

class NestedTxDb implements Db {
    constructor(
        protected _inner: Db,
        protected _flushUnlocked: () => Promise<void>,
        protected _mode: { value: TxMode | null },
    ) {}

    get schema(): DbSchema {
        return this._inner.schema
    }

    collection<T extends Row>(name: string): Collection<T> {
        return new WriteGuardCollection(this._inner.collection(name), this._mode)
    }

    transact<R>(_names: readonly string[], _mode: TxMode, _fn: (db: Db) => Promise<R>): Promise<R> {
        return Promise.reject(new Error("nested transact is not supported"))
    }

    flush(): Promise<void> {
        if (this._mode.value === "r") return Promise.resolve()
        return this._flushUnlocked()
    }

    close(): Promise<void> {
        return this._inner.close()
    }
}

class IdbCollection<T extends Row> implements Collection<T> {
    readonly name: string
    protected _def: CollectionDef
    protected _keyPath: string
    protected _indexes: Map<string, IndexDef>
    protected _idb: () => IDBDatabase
    protected _pending: Pending
    protected _seq: SeqBox
    protected _deferPut: (collectionName: string) => boolean

    constructor(
        def: CollectionDef,
        idb: () => IDBDatabase,
        pending: Pending,
        seq: SeqBox,
        deferPut: (collectionName: string) => boolean,
    ) {
        this.name = def.name
        this._def = def
        this._keyPath = def.keyPath
        this._indexes = new Map()
        for (let index of def.indexes ?? []) this._indexes.set(index.name, index)
        this._idb = idb
        this._pending = pending
        this._seq = seq
        this._deferPut = deferPut
    }

    protected _colPending(): Map<string, PendingEntry> | undefined {
        return this._pending.get(this.name)
    }

    protected _ensurePending(): Map<string, PendingEntry> {
        let map = this._pending.get(this.name)
        if (!map) {
            map = new Map()
            this._pending.set(this.name, map)
        }
        return map
    }

    protected _batchEnabled(): boolean {
        return this._deferPut(this.name)
    }

    async get(key: string): Promise<T | null> {
        let pending = this._colPending()?.get(key)
        if (pending !== undefined) return pending.row as T
        let req!: IDBRequest
        await runTx(this._idb(), [this.name], "readonly", (tx) => {
            req = tx.objectStore(this.name).get(key)
        })
        return (req.result as T | undefined) ?? null
    }

    async getMany(keys: readonly string[]): Promise<Array<T | null>> {
        if (keys.length === 0) return []
        let reqs: IDBRequest[] = []
        await runTx(this._idb(), [this.name], "readonly", (tx) => {
            let store = tx.objectStore(this.name)
            for (let key of keys) reqs.push(store.get(key))
        })
        let pending = this._colPending()
        return keys.map((key, i) => {
            let hit = pending?.get(key)
            if (hit) return hit.row as T
            return (reqs[i]!.result as T | undefined) ?? null
        })
    }

    async put(row: T, opts?: PutOpts): Promise<void> {
        let pk = primaryKeyOf(row, this._keyPath)
        let stored = withStringPk(row, this._keyPath, pk)
        if ((opts?.flush ?? "now") === "batch" && this._batchEnabled()) {
            this._ensurePending().set(pk, { row: stored, seq: nextSeq(this._seq) })
            return
        }
        this._colPending()?.delete(pk)
        nextSeq(this._seq)
        await runTx(this._idb(), [this.name], "readwrite", (tx) => {
            tx.objectStore(this.name).put(stored)
        })
    }

    async putMany(rows: readonly T[], opts?: PutOpts): Promise<void> {
        if (rows.length === 0) return
        let batch = (opts?.flush ?? "now") === "batch" && this._batchEnabled()
        if (batch) {
            let pending = this._ensurePending()
            for (let row of rows) {
                let pk = primaryKeyOf(row, this._keyPath)
                pending.set(pk, { row: withStringPk(row, this._keyPath, pk), seq: nextSeq(this._seq) })
            }
            return
        }
        let live = this._colPending()
        await runTx(this._idb(), [this.name], "readwrite", (tx) => {
            let store = tx.objectStore(this.name)
            for (let row of rows) {
                let pk = primaryKeyOf(row, this._keyPath)
                live?.delete(pk)
                nextSeq(this._seq)
                store.put(withStringPk(row, this._keyPath, pk))
            }
        })
    }

    async delete(keys: readonly string[]): Promise<void> {
        let pending = this._colPending()
        if (pending) {
            for (let key of keys) pending.delete(key)
        }
        if (keys.length > 0) nextSeq(this._seq)
        if (keys.length === 0) return
        await runTx(this._idb(), [this.name], "readwrite", (tx) => {
            let store = tx.objectStore(this.name)
            for (let key of keys) store.delete(key)
        })
    }

    async clear(): Promise<void> {
        this._pending.delete(this.name)
        nextSeq(this._seq)
        await runTx(this._idb(), [this.name], "readwrite", (tx) => {
            tx.objectStore(this.name).clear()
        })
    }

    async count(): Promise<number> {
        let pending = this._colPending()
        if (!pending || pending.size === 0) {
            let req!: IDBRequest<number>
            await runTx(this._idb(), [this.name], "readonly", (tx) => {
                req = tx.objectStore(this.name).count()
            })
            return req.result
        }
        let req!: IDBRequest<IDBValidKey[]>
        await runTx(this._idb(), [this.name], "readonly", (tx) => {
            req = tx.objectStore(this.name).getAllKeys()
        })
        let keys = new Set((req.result ?? []).map((k) => String(k)))
        for (let pk of pending.keys()) keys.add(pk)
        return keys.size
    }

    async getAll(): Promise<T[]> {
        let req!: IDBRequest<T[]>
        await runTx(this._idb(), [this.name], "readonly", (tx) => {
            req = tx.objectStore(this.name).getAll()
        })
        let map = new Map<string, T>()
        for (let row of req.result ?? []) {
            map.set(String(row[this._keyPath]), row)
        }
        let pending = this._colPending()
        if (pending) {
            for (let [pk, entry] of pending) map.set(pk, entry.row as T)
        }
        let entries = [...map.entries()]
        entries.sort((a, b) => compareIndexKey(a[0], b[0]))
        return entries.map(([, row]) => row)
    }

    async scan(index: string, bound: ScanBound = {}): Promise<Array<ScanHit<T>>> {
        if (index !== "__pk" && !this._indexes.has(index)) throw new Error(`unknown index: ${index}`)
        let range = toIdbKeyRange(bound)
        let pending = this._colPending()
        let hasPending = pending !== undefined && pending.size > 0
        let hits: Array<ScanHit<T>> = []
        if (range !== null) {
            let keysOnly = bound.keysOnly === true
            let limit = hasPending || bound.limit === undefined ? undefined : Math.max(0, bound.limit)
            if (limit !== 0) {
                await runTx(this._idb(), [this.name], "readonly", (tx) => {
                    let store = tx.objectStore(this.name)
                    let source: IDBObjectStore | IDBIndex = index === "__pk" ? store : store.index(index)
                    let req = keysOnly ? source.openKeyCursor(range) : source.openCursor(range)
                    req.onsuccess = () => {
                        let cursor = req.result
                        if (!cursor) return
                        let primaryKey = String(cursor.primaryKey)
                        let indexKey = cursor.key as IndexKey
                        if (keysOnly) {
                            hits.push({ primaryKey, indexKey })
                        } else {
                            hits.push({
                                primaryKey,
                                indexKey,
                                value: (cursor as IDBCursorWithValue).value as T,
                            })
                        }
                        if (limit !== undefined && hits.length >= limit) return
                        cursor.continue()
                    }
                })
            }
        }
        if (pending && pending.size > 0) hits = this._mergePending(index, bound, hits, pending)
        if (bound.limit !== undefined) hits = hits.slice(0, Math.max(0, bound.limit))
        return hits
    }

    protected _mergePending(
        index: string,
        bound: ScanBound,
        hits: Array<ScanHit<T>>,
        pending: Map<string, PendingEntry>,
    ): Array<ScanHit<T>> {
        let replaced = new Set(pending.keys())
        let out = hits.filter((h) => !replaced.has(h.primaryKey))
        let keyPath = indexKeyPath(this._def, index)
        for (let [pk, entry] of pending) {
            let indexKey: IndexKey | undefined = index === "__pk" ? pk : projectIndexKey(entry.row, keyPath)
            if (indexKey === undefined) continue
            if (!inRange(indexKey, bound)) continue
            if (bound.keysOnly) out.push({ primaryKey: pk, indexKey })
            else out.push({ primaryKey: pk, indexKey, value: entry.row as T })
        }
        out.sort((a, b) => {
            let c = compareIndexKey(a.indexKey, b.indexKey)
            if (c !== 0) return c
            return compareIndexKey(a.primaryKey, b.primaryKey)
        })
        return out
    }
}

class IdbDb implements Db {
    readonly schema: DbSchema
    protected _idb: IDBDatabase
    protected _collections: Map<string, IdbCollection<Row>>
    protected _pending: Pending = new Map()
    protected _seq: SeqBox = { n: 0 }
    protected _lock: SerialQueue = new SerialQueue()
    protected _inTransact: AsyncLocalStorage<true> = new AsyncLocalStorage<true>()
    protected _txMode: { value: TxMode | null } = { value: null }
    protected _txView: Db
    protected _onClose: () => void
    protected _closed = false

    constructor(
        schema: DbSchema,
        idb: IDBDatabase,
        deferPut: (collectionName: string) => boolean,
        onClose: () => void,
    ) {
        this.schema = schema
        this._idb = idb
        this._onClose = onClose
        this._collections = new Map()
        this._txView = new NestedTxDb(this, () => this._flushPending(), this._txMode)
        this._idb.onversionchange = () => {
            this._closed = true
            this._idb.close()
            this._onClose()
        }
        for (let def of schema.collections) {
            this._collections.set(
                def.name,
                new IdbCollection(def, () => this._idb, this._pending, this._seq, deferPut),
            )
        }
    }

    collection<T extends Row>(name: string): Collection<T> {
        let col = this._collections.get(name)
        if (!col) throw new Error(`unknown collection: ${name}`)
        return col as Collection<T>
    }

    transact<R>(names: readonly string[], mode: TxMode, fn: (db: Db) => Promise<R>): Promise<R> {
        for (let name of names) {
            if (!this._collections.has(name)) throw new Error(`unknown collection: ${name}`)
        }
        if (this._inTransact.getStore()) return Promise.reject(new Error("nested transact is not supported"))
        return this._lock.with(() =>
            this._inTransact.run(true, async () => {
                this._txMode.value = mode
                try {
                    let result = await fn(this._txView)
                    if (mode !== "r") await this._flushPending()
                    return result
                } finally {
                    this._txMode.value = null
                }
            }),
        )
    }

    flush(): Promise<void> {
        return this._lock.with(() => this._flushPending())
    }

    async close(): Promise<void> {
        if (this._closed) return
        this._closed = true
        try {
            await this._flushPending()
        } finally {
            this._idb.close()
            this._onClose()
        }
    }

    protected async _flushPending(): Promise<void> {
        let snapshot: Array<[string, Array<[string, PendingEntry]>]> = []
        for (let [name, rows] of this._pending) {
            if (rows.size === 0) continue
            snapshot.push([name, [...rows.entries()]])
        }
        if (snapshot.length === 0) return
        await Promise.resolve()
        let names = snapshot.map(([name]) => name)
        await runTx(this._idb, names, "readwrite", (tx) => {
            for (let [name, entries] of snapshot) {
                let live = this._pending.get(name)
                let store = tx.objectStore(name)
                for (let [pk, entry] of entries) {
                    let cur = live?.get(pk)
                    if (!cur || cur.seq !== entry.seq) continue
                    store.put(entry.row)
                }
            }
        })
        for (let [name, entries] of snapshot) {
            let live = this._pending.get(name)
            if (!live) continue
            for (let [pk, entry] of entries) {
                let cur = live.get(pk)
                if (cur && cur.seq === entry.seq) live.delete(pk)
            }
        }
    }
}

class IdbDriver implements DbDriver {
    protected log: Logger
    protected _factory: IDBFactory
    protected _dbName: string | undefined
    protected _deferPut: (collectionName: string) => boolean
    protected _conns: Set<IDBDatabase> = new Set()

    constructor(opts: {
        dbName?: string
        indexedDB?: IDBFactory
        log?: Logger
        deferPut?: (collectionName: string) => boolean
    }) {
        this.log = makeLog(opts.log ?? makeSilentLog(), "yorozu-db-idb")
        this._factory = opts.indexedDB ?? globalThis.indexedDB
        this._dbName = opts.dbName
        this._deferPut = opts.deferPut ?? (() => true)
    }

    async open(schema: DbSchema): Promise<Db> {
        if (!this._factory) {
            let err = new Error("indexedDB is not available")
            this.log.error(err)
            throw err
        }
        let name = this._dbName ?? schema.name
        let idb = await openIdb(this._factory, name, schema, this.log)
        this._conns.add(idb)
        return new IdbDb(schema, idb, this._deferPut, () => {
            this._conns.delete(idb)
        })
    }

    async drop(schema: DbSchema): Promise<void> {
        if (!this._factory) {
            let err = new Error("indexedDB is not available")
            this.log.error(err)
            throw err
        }
        let name = this._dbName ?? schema.name
        try {
            for (let conn of [...this._conns]) {
                if (conn.name === name) {
                    conn.close()
                    this._conns.delete(conn)
                }
            }
            await deleteIdb(this._factory, name)
        } catch (err) {
            reportError(this.log, err)
            throw err
        }
    }
}

export function createIdbDriver(
    opts: {
        dbName?: string
        indexedDB?: IDBFactory
        log?: Logger
        deferPut?: (collectionName: string) => boolean
    } = {},
): DbDriver {
    return new IdbDriver(opts)
}
