import type { Collection, PutOpts, ScanBound, ScanHit } from "@yorozu/db"
import { BlobBytesLedger } from "./blob-bytes-ledger"
import type { BytesCapItem } from "./bytes-cap"
import { BY_EVICT_INDEX, type ResourceRow } from "./row"

export async function listEvictItems<Meta = unknown>(
    col: Collection<ResourceRow<Meta>>,
    opts?: { beforeStoredAt?: number; limit?: number },
): Promise<BytesCapItem[]> {
    let bound: ScanBound = { keysOnly: true }
    if (opts?.beforeStoredAt != null) bound.lt = [opts.beforeStoredAt]
    if (opts?.limit != null) bound.limit = opts.limit
    let hits = await col.scan(BY_EVICT_INDEX, bound)
    let out: BytesCapItem[] = []
    for (let hit of hits) {
        let indexKey = hit.indexKey
        let storedAt = Array.isArray(indexKey) ? Number(indexKey[0]) : 0
        let bytes = Array.isArray(indexKey) ? Number(indexKey[1] ?? 0) : 0
        out.push({ key: String(hit.primaryKey), storedAt, bytes })
    }
    return out
}

export function attachBytesLedger<Meta = unknown>(
    col: Collection<ResourceRow<Meta>>,
): Collection<ResourceRow<Meta>> & { getBytesTotal(): Promise<number> } {
    let ledger = new BlobBytesLedger()
    return {
        name: col.name,
        get(key: string): Promise<ResourceRow<Meta> | null> {
            return col.get(key)
        },
        getMany(keys: readonly string[]): Promise<Array<ResourceRow<Meta> | null>> {
            return col.getMany(keys)
        },
        async put(row: ResourceRow<Meta>, opts?: PutOpts): Promise<void> {
            await col.put(row, opts)
            ledger.note(row.key, row.bytes)
        },
        async putMany(rows: readonly ResourceRow<Meta>[], opts?: PutOpts): Promise<void> {
            await col.putMany(rows, opts)
            for (let row of rows) ledger.note(row.key, row.bytes)
        },
        async delete(keys: readonly string[]): Promise<void> {
            await col.delete(keys)
            for (let key of keys) ledger.forget(key)
        },
        async clear(): Promise<void> {
            await col.clear()
            ledger.invalidate()
        },
        count(): Promise<number> {
            return col.count()
        },
        getAll(): Promise<Array<ResourceRow<Meta>>> {
            return col.getAll()
        },
        scan(index: string, bound?: ScanBound): Promise<Array<ScanHit<ResourceRow<Meta>>>> {
            return col.scan(index, bound)
        },
        getBytesTotal(): Promise<number> {
            return ledger.getTotal(() => listEvictItems(col))
        },
    }
}
