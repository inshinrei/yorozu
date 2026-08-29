import type { Collection } from "@yorozu/db"
import { makeLog, makeSilentLog, reportFlowFailure, type Logger } from "@yorozu/log"
import { pickOldestOverBytesCapOrdered } from "./bytes-cap"
import type { BytesLruMap } from "./bytes-lru-map"
import { attachBytesLedger, listEvictItems } from "./collection"
import type { DropHandler, DropReason } from "./drop"
import type { ResourceRow } from "./row"

const ISSUE_KEY: string = "yorozu-resource-cache"

export type ResourceCacheCaps = {
    maxBytes?: number
    maxAgeMs?: number
    maxEntries?: number
}

export type ResourceCache<Meta = unknown> = {
    get(key: string): Promise<ResourceRow<Meta> | null>
    put(record: Omit<ResourceRow<Meta>, "bytes"> & { bytes?: number }): Promise<void>
    delete(keys: string[]): Promise<void>
    clear(): Promise<void>
    evict(mode?: "full" | "meta" | "bytes"): Promise<void>
    setCaps(next: ResourceCacheCaps): Promise<void>
    getBytesTotal(): Promise<number>
    peekL1(key: string): ResourceRow<Meta> | undefined
}

export function createResourceCache<Meta = unknown>(opts: {
    collection: Collection<ResourceRow<Meta>>
    drop: DropHandler<Meta>
    caps?: ResourceCacheCaps
    l1?: BytesLruMap<string, ResourceRow<Meta>>
    onDropped?(keys: string[], reason: DropReason): void
    evictMetaEveryNPuts?: number
    log?: Logger
}): ResourceCache<Meta> {
    let log = makeLog(opts.log ?? makeSilentLog(), ISSUE_KEY)
    let caps: ResourceCacheCaps = opts.caps ?? {}
    let items = attachBytesLedger(opts.collection)
    let l1 = opts.l1
    let putsSinceEvict = 0
    let drop = opts.drop
    let onDropped = opts.onDropped
    let evictMetaEveryNPuts = opts.evictMetaEveryNPuts

    async function applyDrop(keys: string[], reason: DropReason): Promise<void> {
        if (keys.length === 0) return
        await drop.apply(items, { keys, reason })
        onDropped?.(keys, reason)
        if (l1) {
            for (let key of keys) l1.delete(key)
        }
    }

    async function evict(mode: "full" | "meta" | "bytes" = "full"): Promise<void> {
        if (mode === "full" || mode === "meta") {
            if (caps.maxAgeMs != null) {
                let cutoff = Date.now() - caps.maxAgeMs
                let expired = await listEvictItems(items, { beforeStoredAt: cutoff })
                if (expired.length)
                    await applyDrop(
                        expired.map((i) => i.key),
                        "ttl",
                    )
            }
            if (caps.maxEntries != null) {
                let n = await items.count()
                if (n > caps.maxEntries) {
                    let extra = n - caps.maxEntries
                    let oldest = await listEvictItems(items, { limit: extra })
                    await applyDrop(
                        oldest.map((i) => i.key),
                        "count",
                    )
                }
            }
        }
        if (mode === "full" || mode === "bytes") {
            let maxBytes = caps.maxBytes
            if (maxBytes == null) return
            let flow = log.flow("resource-evict", { capBytes: maxBytes })
            try {
                let total = await items.getBytesTotal()
                if (maxBytes > 0 && total <= maxBytes) {
                    flow.info("skip", { capBytes: maxBytes, totalBytes: total })
                    return
                }
                let listed = await listEvictItems(items)
                let keys = pickOldestOverBytesCapOrdered(listed, total, maxBytes)
                if (!keys.length) {
                    flow.info("skip", { capBytes: maxBytes, totalBytes: total })
                    return
                }
                let dropSet = new Set(keys)
                let remainingBytes = 0
                for (let it of listed) {
                    if (!dropSet.has(it.key)) remainingBytes += it.bytes
                }
                flow.info("start", { dropped: keys.length, remainingBytes, capBytes: maxBytes })
                await applyDrop(keys, "bytes")
                flow.info("done", { dropped: keys.length, remainingBytes, capBytes: maxBytes })
            } catch (err) {
                reportFlowFailure(flow, err, { capBytes: maxBytes })
                throw err
            }
        }
    }

    return {
        async get(key: string): Promise<ResourceRow<Meta> | null> {
            let hit = l1?.get(key)
            if (hit) return hit
            let row = await items.get(key)
            if (row) l1?.set(key, row)
            return row
        },
        async put(record: Omit<ResourceRow<Meta>, "bytes"> & { bytes?: number }): Promise<void> {
            let bytes = record.blob?.size ?? record.bytes ?? 0
            if (caps.maxBytes != null && bytes > caps.maxBytes) return
            let rec: ResourceRow<Meta> = { ...record, bytes }
            await items.put(rec)
            l1?.set(rec.key, rec)
            if (bytes > 0 && caps.maxBytes != null) await evict("bytes")
            if (evictMetaEveryNPuts != null && evictMetaEveryNPuts > 0) {
                putsSinceEvict++
                if (putsSinceEvict >= evictMetaEveryNPuts) {
                    putsSinceEvict = 0
                    await evict("meta")
                }
            }
        },
        async delete(keys: string[]): Promise<void> {
            await items.delete(keys)
            if (l1) {
                for (let key of keys) l1.delete(key)
            }
        },
        async clear(): Promise<void> {
            await items.clear()
            l1?.clear()
        },
        evict,
        async setCaps(next: ResourceCacheCaps): Promise<void> {
            caps = next
            await evict("full")
        },
        getBytesTotal(): Promise<number> {
            return items.getBytesTotal()
        },
        peekL1(key: string): ResourceRow<Meta> | undefined {
            return l1?.peek(key)
        },
    }
}
