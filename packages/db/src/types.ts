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
     * When true, implementations MUST NOT materialize row values.
     * ScanHit.value is omitted.
     */
    keysOnly?: boolean
}

export type ScanHit<T> = {
    primaryKey: string
    indexKey: IndexKey
    value?: T
}

export type PutOpts = { flush?: "now" | "batch" }

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
