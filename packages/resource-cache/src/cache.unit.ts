import { afterEach, describe, expect, it, vi } from "vitest"
import { openMemoryDb } from "@yorozu/db"
import { createTestLog, expectFlowStory } from "@yorozu/log"
import { BytesLruMap } from "./bytes-lru-map"
import { createResourceCache } from "./cache"
import { dropDelete, dropStripBlob, type DropReason } from "./drop"
import { resourceSchema, type ResourceRow } from "./row"

function blobOf(n: number): Blob {
    return new Blob([new Uint8Array(n)])
}

async function filesCol() {
    let db = await openMemoryDb(resourceSchema("t", ["files"]))
    return db.collection<ResourceRow>("files")
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("createResourceCache", () => {
    it("under cap uses getBytesTotal only and does not scan on evict(bytes)", async () => {
        let col = await filesCol()
        let scan = vi.spyOn(col, "scan")
        let cache = createResourceCache({
            collection: col,
            drop: dropStripBlob(),
            caps: { maxBytes: 1000 },
        })
        await cache.put({ key: "a", storedAt: Date.now(), blob: blobOf(10), meta: {} })
        scan.mockClear()
        await cache.evict("bytes")
        expect(scan).not.toHaveBeenCalled()
        expect(await cache.getBytesTotal()).toBe(10)
    })

    it("over cap + strip removes the oldest blob and keeps the meta row", async () => {
        let col = await filesCol()
        let cache = createResourceCache({
            collection: col,
            drop: dropStripBlob(),
            caps: { maxBytes: 10 },
        })
        await cache.put({ key: "old", storedAt: 1, blob: blobOf(10), meta: { i: 1 } })
        await cache.put({ key: "new", storedAt: 2, blob: blobOf(10), meta: { i: 2 } })
        let old = await col.get("old")
        expect(old).toMatchObject({ key: "old", storedAt: 1, bytes: 0, meta: { i: 1 } })
        expect(old?.blob).toBeUndefined()
        let neu = await col.get("new")
        expect(neu?.blob).toBeTruthy()
        expect(neu?.bytes).toBe(10)
        expect(await cache.getBytesTotal()).toBe(10)
    })

    it("over cap + delete removes the oldest row", async () => {
        let col = await filesCol()
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxBytes: 10 },
        })
        await cache.put({ key: "old", storedAt: 1, blob: blobOf(10), meta: {} })
        await cache.put({ key: "new", storedAt: 2, blob: blobOf(10), meta: {} })
        expect(await col.get("old")).toBeNull()
        expect(await col.get("new")).not.toBeNull()
        expect(await col.count()).toBe(1)
    })

    it("TTL scans by-evict keysOnly with lt cutoff then drops", async () => {
        let now = 1_700_000_000_000
        vi.spyOn(Date, "now").mockReturnValue(now)
        let col = await filesCol()
        let scan = vi.spyOn(col, "scan")
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxAgeMs: 1000 },
        })
        await cache.put({ key: "old", storedAt: now - 5000, blob: blobOf(1), meta: {} })
        await cache.put({ key: "keep", storedAt: now - 100, blob: blobOf(1), meta: {} })
        scan.mockClear()
        await cache.evict("meta")
        expect(scan).toHaveBeenCalledWith("by-evict", { keysOnly: true, lt: [now - 1000] })
        expect(await col.get("old")).toBeNull()
        expect(await col.get("keep")).not.toBeNull()
    })

    it("count cap drops extra oldest rows", async () => {
        let col = await filesCol()
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxEntries: 2 },
        })
        await cache.put({ key: "a", storedAt: 1, blob: blobOf(1), meta: {} })
        await cache.put({ key: "b", storedAt: 2, blob: blobOf(1), meta: {} })
        await cache.put({ key: "c", storedAt: 3, blob: blobOf(1), meta: {} })
        expect(await col.count()).toBe(3)
        await cache.evict("meta")
        expect(await col.get("a")).toBeNull()
        expect(await col.get("b")).not.toBeNull()
        expect(await col.get("c")).not.toBeNull()
        expect(await col.count()).toBe(2)
    })

    it("put of a blob larger than maxBytes does not call collection.put", async () => {
        let col = await filesCol()
        let put = vi.spyOn(col, "put")
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxBytes: 5 },
        })
        await cache.put({ key: "huge", storedAt: 1, blob: blobOf(10), meta: {} })
        expect(put).not.toHaveBeenCalled()
        expect(await col.get("huge")).toBeNull()
        expect(await cache.get("huge")).toBeNull()
    })

    it("setCaps shrink trims immediately", async () => {
        let col = await filesCol()
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxBytes: 100 },
        })
        await cache.put({ key: "old", storedAt: 1, blob: blobOf(10), meta: {} })
        await cache.put({ key: "new", storedAt: 2, blob: blobOf(10), meta: {} })
        expect(await col.count()).toBe(2)
        await cache.setCaps({ maxBytes: 10 })
        expect(await col.get("old")).toBeNull()
        expect(await col.get("new")).not.toBeNull()
        expect(await cache.getBytesTotal()).toBe(10)
    })

    it("fires L1 onEvict and onDropped on bytes drop", async () => {
        let col = await filesCol()
        let evicted: string[] = []
        let dropped: Array<{ keys: string[]; reason: DropReason }> = []
        let l1 = new BytesLruMap<string, ResourceRow>({
            maxBytes: 1000,
            maxEntries: 1,
            sizeOf: (r) => r.bytes,
            onEvict: (key) => {
                evicted.push(key)
            },
        })
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxBytes: 15 },
            l1,
            onDropped: (keys, reason) => {
                dropped.push({ keys, reason })
            },
        })
        await cache.put({ key: "old", storedAt: 1, blob: blobOf(10), meta: {} })
        await cache.put({ key: "new", storedAt: 2, blob: blobOf(10), meta: {} })
        expect(dropped).toEqual([{ keys: ["old"], reason: "bytes" }])
        expect(evicted).toEqual(["old"])
        expect(cache.peekL1("old")).toBeUndefined()
        expect(cache.peekL1("new")?.key).toBe("new")
    })

    it("evictMetaEveryNPuts: 1 runs TTL/count after put", async () => {
        let now = 1_700_000_000_000
        vi.spyOn(Date, "now").mockReturnValue(now)
        let col = await filesCol()
        let scan = vi.spyOn(col, "scan")
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxAgeMs: 1000, maxEntries: 1 },
            evictMetaEveryNPuts: 1,
        })
        await cache.put({ key: "keep", storedAt: now, blob: blobOf(1), meta: {} })
        await cache.put({ key: "old", storedAt: now - 10_000, blob: blobOf(1), meta: {} })
        expect(scan).toHaveBeenCalledWith("by-evict", { keysOnly: true, lt: [now - 1000] })
        expect(await col.get("old")).toBeNull()
        expect(await col.get("keep")).not.toBeNull()
        expect(await col.count()).toBe(1)
    })

    it("resource-evict flow is skip under cap and start/done when trimming", async () => {
        let col = await filesCol()
        let raw = createTestLog()
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            caps: { maxBytes: 15 },
            log: raw,
        })
        await cache.put({ key: "old", storedAt: 1, blob: blobOf(10), meta: {} })
        await cache.put({ key: "new", storedAt: 2, blob: blobOf(10), meta: {} })
        expectFlowStory(raw.collect(), "resource-evict", ["skip", "start", "done"])
        expect(await col.get("old")).toBeNull()
    })

    it("get prefers L1 then collection; delete and clear drop both", async () => {
        let col = await filesCol()
        let l1 = new BytesLruMap<string, ResourceRow>({
            maxBytes: 1000,
            sizeOf: (r) => r.bytes,
        })
        let cache = createResourceCache({
            collection: col,
            drop: dropDelete,
            l1,
        })
        await cache.put({ key: "a", storedAt: 1, blob: blobOf(4), meta: {} })
        let get = vi.spyOn(col, "get")
        expect((await cache.get("a"))?.key).toBe("a")
        expect(get).not.toHaveBeenCalled()
        expect(cache.peekL1("a")?.bytes).toBe(4)

        await cache.delete(["a"])
        expect(await cache.get("a")).toBeNull()
        expect(cache.peekL1("a")).toBeUndefined()

        await cache.put({ key: "b", storedAt: 2, blob: blobOf(2), meta: {} })
        await cache.clear()
        expect(await col.count()).toBe(0)
        expect(cache.peekL1("b")).toBeUndefined()
        expect(await cache.getBytesTotal()).toBe(0)
    })
})
