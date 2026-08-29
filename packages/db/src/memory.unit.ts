import { describe, expect, it } from "vitest"
import { openMemoryDb } from "./memory"
import type { DbSchema } from "./types"

type ResourceRow = {
    key: string
    storedAt: number
    bytes: number
    blob?: Blob
    meta: Record<string, unknown>
}

const schema: DbSchema = {
    name: "t",
    version: 1,
    collections: [
        {
            name: "files",
            keyPath: "key",
            indexes: [{ name: "by-evict", keyPath: ["storedAt", "bytes"] }],
        },
    ],
}

function row(partial: Partial<ResourceRow> & Pick<ResourceRow, "key">): ResourceRow {
    return {
        storedAt: 0,
        bytes: 0,
        meta: {},
        ...partial,
    }
}

describe("openMemoryDb", () => {
    it("put/get/delete/count/getAll", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        let a = row({ key: "a", storedAt: 1, bytes: 8 })
        let b = row({ key: "b", storedAt: 2, bytes: 4 })
        await col.put(a)
        await col.put(b)
        expect(await col.get("a")).toEqual(a)
        expect(await col.get("missing")).toBeNull()
        expect(await col.count()).toBe(2)
        expect(await col.getAll()).toEqual([a, b])
        await col.delete(["a"])
        expect(await col.get("a")).toBeNull()
        expect(await col.count()).toBe(1)
        await col.clear()
        expect(await col.count()).toBe(0)
        expect(db.schema).toEqual(schema)
        expect(col.name).toBe("files")
    })

    it("getMany order matches keys, missing → null", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        let a = row({ key: "a" })
        await col.put(a)
        expect(await col.getMany(["a", "missing", "a"])).toEqual([a, null, a])
    })

    it("putMany writes all rows", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        let a = row({ key: "a", storedAt: 1 })
        let b = row({ key: "b", storedAt: 2 })
        await col.putMany([a, b])
        expect(await col.get("a")).toEqual(a)
        expect(await col.get("b")).toEqual(b)
        expect(await col.count()).toBe(2)
    })

    it("scan __pk walks primary keys in key order", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        let c = row({ key: "c" })
        let a = row({ key: "a" })
        let b = row({ key: "b" })
        await col.putMany([c, a, b])
        let hits = await col.scan("__pk")
        expect(hits.map((h) => h.primaryKey)).toEqual(["a", "b", "c"])
        expect(hits[0]?.indexKey).toBe("a")
        expect(hits[0]?.value).toEqual(a)
        let bounded = await col.scan("__pk", { gte: "b", lt: "c" })
        expect(bounded.map((h) => h.primaryKey)).toEqual(["b"])
    })

    it("scan by-evict keysOnly: no value, lt [cutoff] excludes storedAt === cutoff", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        let blob = new Blob(["x"])
        await col.putMany([
            row({ key: "old", storedAt: 19, bytes: 99, blob }),
            row({ key: "edge", storedAt: 20, bytes: 8, blob }),
            row({ key: "new", storedAt: 21, bytes: 1, blob }),
        ])
        let hits = await col.scan("by-evict", { lt: [20], keysOnly: true })
        expect(hits.map((h) => h.primaryKey)).toEqual(["old"])
        expect(hits[0]?.indexKey).toEqual([19, 99])
        expect(hits[0]).not.toHaveProperty("value")
        expect(hits[0]).not.toHaveProperty("blob")
    })

    it("nested transact throws", async () => {
        let db = await openMemoryDb(schema)
        await expect(
            db.transact(["files"], "rw", async (inner) => {
                await inner.transact(["files"], "rw", async () => undefined)
            }),
        ).rejects.toThrow()
    })

    it("serializes concurrent transact", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        let order: string[] = []
        let started!: () => void
        let startedP = new Promise<void>((resolve) => {
            started = resolve
        })
        let p1 = db.transact(["files"], "rw", async () => {
            order.push("start-1")
            started()
            await new Promise((r) => setTimeout(r, 20))
            await col.put(row({ key: "a" }))
            order.push("end-1")
        })
        await startedP
        let p2 = db.transact(["files"], "rw", async () => {
            order.push("start-2")
            await col.put(row({ key: "b" }))
            order.push("end-2")
        })
        await Promise.all([p1, p2])
        expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"])
    })

    it("transact r rejects writes and allows reads", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        await col.put(row({ key: "a" }))
        await db.transact(["files"], "r", async (tx) => {
            let inner = tx.collection<ResourceRow>("files")
            expect(await inner.get("a")).toEqual(row({ key: "a" }))
            await expect(inner.put(row({ key: "b" }))).rejects.toThrow(/read-only transact/)
            await expect(inner.putMany([row({ key: "c" })])).rejects.toThrow(/read-only transact/)
            await expect(inner.delete(["a"])).rejects.toThrow(/read-only transact/)
            await expect(inner.clear()).rejects.toThrow(/read-only transact/)
        })
        expect(await col.get("a")).toEqual(row({ key: "a" }))
        expect(await col.get("b")).toBeNull()
        await db.transact(["files"], "rw", async (tx) => {
            await tx.collection<ResourceRow>("files").put(row({ key: "b" }))
        })
        expect(await col.get("b")).toEqual(row({ key: "b" }))
    })

    it("outer put during read transact is allowed", async () => {
        let db = await openMemoryDb(schema)
        let started!: () => void
        let gate = new Promise<void>((r) => {
            started = r
        })
        let txP = db.transact(["files"], "r", async (tx) => {
            started()
            await tx.collection("files").get("a")
            await new Promise((r) => setTimeout(r, 20))
            return tx.collection("files").get("a")
        })
        await gate
        await db.collection("files").put({ key: "a", storedAt: 1, bytes: 0, meta: {} })
        await txP
        expect(await db.collection("files").get("a")).toMatchObject({ key: "a" })
    })

    it("callback collection rejects writes in read transact", async () => {
        let db = await openMemoryDb(schema)
        await expect(
            db.transact(["files"], "r", (tx) => tx.collection("files").put({ key: "x", storedAt: 1, bytes: 0, meta: {} })),
        ).rejects.toThrow(/read-only/)
    })

    it("unknown collection / unknown index throws", async () => {
        let db = await openMemoryDb(schema)
        expect(() => db.collection("nope")).toThrow()
        let col = db.collection<ResourceRow>("files")
        await expect(col.scan("nope")).rejects.toThrow()
    })

    it("flush() resolves", async () => {
        let db = await openMemoryDb(schema)
        let col = db.collection<ResourceRow>("files")
        await col.put(row({ key: "a" }), { flush: "batch" })
        await expect(db.flush()).resolves.toBeUndefined()
        expect(await col.get("a")).toEqual(row({ key: "a" }))
        await expect(db.close()).resolves.toBeUndefined()
    })
})
