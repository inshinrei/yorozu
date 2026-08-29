import { AsyncLock } from "@yorozu/utils"
import { compareIndexKey, inRange } from "./bounds"
import type {
    Collection,
    CollectionDef,
    Db,
    DbSchema,
    IndexDef,
    IndexKey,
    PutOpts,
    ScanBound,
    ScanHit,
    TxMode,
} from "./types"

function isScalarKey(value: unknown): value is string | number {
    return typeof value === "string" || (typeof value === "number" && !Number.isNaN(value))
}

function projectIndexKey(row: Record<string, unknown>, keyPath: string | readonly string[]): IndexKey | undefined {
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

function primaryKeyOf(row: Record<string, unknown>, keyPath: string): string {
    let raw = row[keyPath]
    if (raw === undefined || raw === null) throw new Error(`missing primary key field: ${keyPath}`)
    return String(raw)
}

class MemoryCollection<T extends Record<string, unknown>> implements Collection<T> {
    readonly name: string
    protected _keyPath: string
    protected _indexes: Map<string, IndexDef>
    protected _rows: Map<string, T> = new Map()
    protected _txMode: { value: TxMode | null }

    constructor(def: CollectionDef, txMode: { value: TxMode | null }) {
        this.name = def.name
        this._keyPath = def.keyPath
        this._indexes = new Map()
        this._txMode = txMode
        for (let index of def.indexes ?? []) {
            this._indexes.set(index.name, index)
        }
    }

    protected _assertWritable(): void {
        if (this._txMode.value === "r") throw new Error("write is not allowed in a read-only transact")
    }

    async get(key: string): Promise<T | null> {
        return this._rows.get(key) ?? null
    }

    async getMany(keys: readonly string[]): Promise<Array<T | null>> {
        let out: Array<T | null> = []
        for (let key of keys) {
            out.push(this._rows.get(key) ?? null)
        }
        return out
    }

    async put(row: T, _opts?: PutOpts): Promise<void> {
        this._assertWritable()
        let pk = primaryKeyOf(row, this._keyPath)
        this._rows.set(pk, row)
    }

    async putMany(rows: readonly T[], _opts?: PutOpts): Promise<void> {
        this._assertWritable()
        for (let row of rows) {
            let pk = primaryKeyOf(row, this._keyPath)
            this._rows.set(pk, row)
        }
    }

    async delete(keys: readonly string[]): Promise<void> {
        this._assertWritable()
        for (let key of keys) {
            this._rows.delete(key)
        }
    }

    async clear(): Promise<void> {
        this._assertWritable()
        this._rows.clear()
    }

    async count(): Promise<number> {
        return this._rows.size
    }

    async getAll(): Promise<T[]> {
        let entries = [...this._rows.entries()]
        entries.sort((a, b) => compareIndexKey(a[0], b[0]))
        let out: T[] = []
        for (let [, row] of entries) out.push(row)
        return out
    }

    async scan(index: string, bound: ScanBound = {}): Promise<Array<ScanHit<T>>> {
        let hits: Array<ScanHit<T>> = []
        if (index === "__pk") {
            for (let [pk, row] of this._rows) {
                if (!inRange(pk, bound)) continue
                hits.push(
                    bound.keysOnly ? { primaryKey: pk, indexKey: pk } : { primaryKey: pk, indexKey: pk, value: row },
                )
            }
        } else {
            let def = this._indexes.get(index)
            if (!def) throw new Error(`unknown index: ${index}`)
            for (let [pk, row] of this._rows) {
                let indexKey = projectIndexKey(row, def.keyPath)
                if (indexKey === undefined) continue
                if (!inRange(indexKey, bound)) continue
                hits.push(bound.keysOnly ? { primaryKey: pk, indexKey } : { primaryKey: pk, indexKey, value: row })
            }
        }
        hits.sort((a, b) => {
            let c = compareIndexKey(a.indexKey, b.indexKey)
            if (c !== 0) return c
            return compareIndexKey(a.primaryKey, b.primaryKey)
        })
        if (bound.limit !== undefined) {
            hits = hits.slice(0, Math.max(0, bound.limit))
        }
        return hits
    }
}

class NestedTxDb implements Db {
    constructor(protected _inner: Db) {}

    get schema(): DbSchema {
        return this._inner.schema
    }

    collection<T extends Record<string, unknown>>(name: string): Collection<T> {
        return this._inner.collection(name)
    }

    transact<R>(_names: readonly string[], _mode: TxMode, _fn: (db: Db) => Promise<R>): Promise<R> {
        return Promise.reject(new Error("nested transact is not supported"))
    }

    flush(): Promise<void> {
        return this._inner.flush()
    }

    close(): Promise<void> {
        return this._inner.close()
    }
}

class MemoryDb implements Db {
    readonly schema: DbSchema
    protected _collections: Map<string, MemoryCollection<Record<string, unknown>>>
    protected _lock: AsyncLock = new AsyncLock()
    protected _txView: Db
    protected _txMode: { value: TxMode | null } = { value: null }

    constructor(schema: DbSchema) {
        this.schema = schema
        this._collections = new Map()
        this._txView = new NestedTxDb(this)
        for (let def of schema.collections) {
            this._collections.set(def.name, new MemoryCollection(def, this._txMode))
        }
    }

    collection<T extends Record<string, unknown>>(name: string): Collection<T> {
        let col = this._collections.get(name)
        if (!col) throw new Error(`unknown collection: ${name}`)
        return col as Collection<T>
    }

    transact<R>(names: readonly string[], mode: TxMode, fn: (db: Db) => Promise<R>): Promise<R> {
        for (let name of names) {
            if (!this._collections.has(name)) throw new Error(`unknown collection: ${name}`)
        }
        return this._lock.with(async () => {
            this._txMode.value = mode
            try {
                return await fn(this._txView)
            } finally {
                this._txMode.value = null
            }
        })
    }

    flush(): Promise<void> {
        return Promise.resolve()
    }

    close(): Promise<void> {
        return Promise.resolve()
    }
}

export async function openMemoryDb(schema: DbSchema): Promise<Db> {
    return new MemoryDb(schema)
}
