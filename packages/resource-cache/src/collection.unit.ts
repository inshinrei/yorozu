import { describe, expect, it, vi } from "vitest"
import { openMemoryDb } from "@yorozu/db"
import { attachBytesLedger, listEvictItems } from "./collection"
import { BY_EVICT_INDEX, resourceCollectionDef, resourceSchema, type ResourceRow } from "./row"

function blobOf(n: number): Blob {
    return new Blob([new Uint8Array(n)])
}

function rec(partial: Partial<ResourceRow> & Pick<ResourceRow, "key">): ResourceRow {
    return {
        storedAt: 0,
        bytes: 0,
        meta: {},
        ...partial,
    }
}

async function filesCol() {
    let db = await openMemoryDb(resourceSchema("t", ["files"]))
    return db.collection<ResourceRow>("files")
}

describe("resourceSchema", () => {
    it("builds by-evict collections with default version 1", () => {
        expect(resourceCollectionDef("files")).toEqual({
            name: "files",
            keyPath: "key",
            indexes: [{ name: BY_EVICT_INDEX, keyPath: ["storedAt", "bytes"] }],
        })
        expect(resourceSchema("t", ["files", "avatars"])).toEqual({
            name: "t",
            version: 1,
            collections: [resourceCollectionDef("files"), resourceCollectionDef("avatars")],
        })
        expect(resourceSchema("t", ["files"], 3).version).toBe(3)
        expect(BY_EVICT_INDEX).toBe("by-evict")
    })
})

describe("listEvictItems", () => {
    it("scans by-evict keysOnly with lt cutoff and maps indexKey tuples", async () => {
        let col = await filesCol()
        await col.put(rec({ key: "old", storedAt: 10, bytes: 8, blob: blobOf(8) }))
        await col.put(rec({ key: "mid", storedAt: 20, bytes: 4, blob: blobOf(4) }))
        await col.put(rec({ key: "new", storedAt: 30, bytes: 2, blob: blobOf(2) }))

        let scan = vi.spyOn(col, "scan")
        let items = await listEvictItems(col, { beforeStoredAt: 20 })
        expect(scan).toHaveBeenCalledWith("by-evict", { keysOnly: true, lt: [20] })
        expect(items).toEqual([{ key: "old", storedAt: 10, bytes: 8 }])

        let hits = await col.scan("by-evict", { keysOnly: true, lt: [20] })
        expect(hits).toHaveLength(1)
        expect("value" in hits[0]!).toBe(false)

        expect(await listEvictItems(col)).toEqual([
            { key: "old", storedAt: 10, bytes: 8 },
            { key: "mid", storedAt: 20, bytes: 4 },
            { key: "new", storedAt: 30, bytes: 2 },
        ])
    })

    it("forwards ScanBound.limit when opts.limit is set", async () => {
        let col = await filesCol()
        await col.put(rec({ key: "a", storedAt: 1, bytes: 1 }))
        await col.put(rec({ key: "b", storedAt: 2, bytes: 1 }))
        await col.put(rec({ key: "c", storedAt: 3, bytes: 1 }))
        let scan = vi.spyOn(col, "scan")
        let items = await listEvictItems(col, { limit: 1 })
        expect(scan).toHaveBeenCalledWith("by-evict", { keysOnly: true, limit: 1 })
        expect(items).toEqual([{ key: "a", storedAt: 1, bytes: 1 }])
    })
})

describe("attachBytesLedger", () => {
    it("tracks totals after put, overwrite, and delete", async () => {
        let col = await filesCol()
        let items = attachBytesLedger(col)
        await items.put(rec({ key: "a", storedAt: 1, bytes: 10 }))
        await items.put(rec({ key: "b", storedAt: 2, bytes: 5 }))
        expect(await items.getBytesTotal()).toBe(15)

        let scan = vi.spyOn(col, "scan")
        await items.put(rec({ key: "a", storedAt: 1, bytes: 3 }))
        expect(await items.getBytesTotal()).toBe(8)
        expect(scan).not.toHaveBeenCalled()

        await items.delete(["a"])
        expect(await items.getBytesTotal()).toBe(5)
        expect(scan).not.toHaveBeenCalled()
    })

    it("retries getBytesTotal when note happens during list and does not assign the stale snapshot", async () => {
        let col = await filesCol()
        await col.put(rec({ key: "a", storedAt: 1, bytes: 10 }))
        let items = attachBytesLedger(col)
        let orig = col.scan.bind(col)
        let n = 0
        vi.spyOn(col, "scan").mockImplementation(async (index, bound) => {
            n++
            if (n === 1) {
                await items.put(rec({ key: "b", storedAt: 2, bytes: 5 }))
                return [{ primaryKey: "a", indexKey: [1, 10] }]
            }
            return orig(index, bound)
        })
        expect(await items.getBytesTotal()).toBe(15)
        expect(n).toBe(2)
        n = 0
        expect(await items.getBytesTotal()).toBe(15)
        expect(n).toBe(0)
    })
})
