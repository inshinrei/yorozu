import "fake-indexeddb/auto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DbSchema } from "@yorozu/db"
import { makeSilentLog } from "@yorozu/log"
import { createIdbDriver } from "./driver"

let here = dirname(fileURLToPath(import.meta.url))

let schema: DbSchema = {
    name: "t",
    version: 1,
    collections: [
        {
            name: "files",
            keyPath: "key",
            indexes: [{ name: "by-evict", keyPath: ["storedAt", "bytes"] }],
        },
        { name: "contacts", keyPath: "id" },
    ],
}

type FileRow = {
    key: string
    storedAt: number
    bytes: number
    blob?: Blob
    meta: Record<string, unknown>
}

type ContactRow = { id: string; name: string }

let dbSeq = 0

function nextName(): string {
    dbSeq++
    return `t-${dbSeq}`
}

function fileRow(partial: Partial<FileRow> & Pick<FileRow, "key">): FileRow {
    return {
        storedAt: 0,
        bytes: 0,
        meta: {},
        ...partial,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("createIdbDriver", () => {
    it("put/get/delete/count", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let a = fileRow({ key: "a", storedAt: 1, bytes: 8 })
        let b = fileRow({ key: "b", storedAt: 2, bytes: 4 })
        await col.put(a)
        await col.put(b)
        expect(await col.get("a")).toEqual(a)
        expect(await col.get("missing")).toBeNull()
        expect(await col.count()).toBe(2)
        await col.delete(["a"])
        expect(await col.get("a")).toBeNull()
        expect(await col.count()).toBe(1)
        expect(db.schema).toEqual(schema)
        expect(col.name).toBe("files")
        await db.close()
    })

    it("scan by-evict keysOnly does not load values or clone blobs", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let blob = new Blob(["hello-blob"])
        await col.putMany([
            fileRow({ key: "old", storedAt: 19, bytes: 99, blob }),
            fileRow({ key: "edge", storedAt: 20, bytes: 8, blob }),
            fileRow({ key: "new", storedAt: 21, bytes: 1, blob }),
        ])

        let openCursor = vi.spyOn(IDBIndex.prototype, "openCursor")
        let openKeyCursor = vi.spyOn(IDBIndex.prototype, "openKeyCursor")
        let valueReads = 0
        let valueDesc = Object.getOwnPropertyDescriptor(IDBCursorWithValue.prototype, "value")
        if (valueDesc?.get) {
            let orig = valueDesc.get
            Object.defineProperty(IDBCursorWithValue.prototype, "value", {
                configurable: true,
                enumerable: valueDesc.enumerable,
                get(this: IDBCursorWithValue) {
                    valueReads++
                    return orig.call(this)
                },
            })
        }

        try {
            let cutoff = 20
            let hits = await col.scan("by-evict", { keysOnly: true, lt: [cutoff] })
            expect(hits.map((h) => h.primaryKey)).toEqual(["old"])
            expect(hits[0]?.indexKey).toEqual([19, 99])
            expect(hits[0]).not.toHaveProperty("value")
            expect(hits[0]?.value).toBeUndefined()
            expect(openCursor).not.toHaveBeenCalled()
            expect(openKeyCursor).toHaveBeenCalled()
            expect(valueReads).toBe(0)
        } finally {
            if (valueDesc) Object.defineProperty(IDBCursorWithValue.prototype, "value", valueDesc)
            await db.close()
        }
    })

    it("prefix bound excludes storedAt === cutoff", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await col.putMany([
            fileRow({ key: "old", storedAt: 19, bytes: 99 }),
            fileRow({ key: "edge", storedAt: 20, bytes: 8 }),
            fileRow({ key: "new", storedAt: 21, bytes: 1 }),
        ])
        let hits = await col.scan("by-evict", { lt: [20], keysOnly: true })
        expect(hits.map((h) => h.primaryKey)).toEqual(["old"])
        expect(hits.map((h) => h.indexKey)).toEqual([[19, 99]])
        await db.close()
    })

    it("putMany writes in one logical batch", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let a = fileRow({ key: "a", storedAt: 1 })
        let b = fileRow({ key: "b", storedAt: 2 })
        let txSpy = vi.spyOn(IDBDatabase.prototype, "transaction")
        txSpy.mockClear()
        await col.putMany([a, b])
        expect(txSpy).toHaveBeenCalledTimes(1)
        expect(await col.get("a")).toEqual(a)
        expect(await col.get("b")).toEqual(b)
        expect(await col.count()).toBe(2)
        await db.close()
    })

    it("flush coalesces two batch puts of the same pk to the last row", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let first = fileRow({ key: "a", storedAt: 1, bytes: 1, meta: { n: 1 } })
        let last = fileRow({ key: "a", storedAt: 2, bytes: 2, meta: { n: 2 } })
        let putSpy = vi.spyOn(IDBObjectStore.prototype, "put")
        await col.put(first, { flush: "batch" })
        await col.put(last, { flush: "batch" })
        expect(putSpy).not.toHaveBeenCalled()
        await db.flush()
        expect(putSpy).toHaveBeenCalledTimes(1)
        expect(await col.get("a")).toEqual(last)
        await db.close()
    })

    it("transact serializes rw", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let order: string[] = []
        let started!: () => void
        let startedP = new Promise<void>((resolve) => {
            started = resolve
        })
        let p1 = db.transact(["files"], "rw", async () => {
            order.push("start-1")
            started()
            await new Promise((r) => setTimeout(r, 20))
            await col.put(fileRow({ key: "a" }))
            order.push("end-1")
        })
        await startedP
        let p2 = db.transact(["files"], "rw", async () => {
            order.push("start-2")
            await col.put(fileRow({ key: "b" }))
            order.push("end-2")
        })
        await Promise.all([p1, p2])
        expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"])
        await db.close()
    })

    it("transact r rejects writes and allows reads", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let a = fileRow({ key: "a" })
        await col.put(a)
        await db.transact(["files"], "r", async (tx) => {
            let inner = tx.collection<FileRow>("files")
            expect(await inner.get("a")).toEqual(a)
            await expect(inner.put(fileRow({ key: "b" }))).rejects.toThrow(/read-only transact/)
            await expect(inner.putMany([fileRow({ key: "c" })])).rejects.toThrow(/read-only transact/)
            await expect(inner.delete(["a"])).rejects.toThrow(/read-only transact/)
            await expect(inner.clear()).rejects.toThrow(/read-only transact/)
        })
        expect(await col.get("a")).toEqual(a)
        expect(await col.get("b")).toBeNull()
        await db.transact(["files"], "rw", async (tx) => {
            await tx.collection<FileRow>("files").put(fileRow({ key: "b" }))
        })
        expect(await col.get("b")).toEqual(fileRow({ key: "b" }))
        await db.close()
    })

    it("outer put during read transact is allowed", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
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
        await db.close()
    })

    it("callback collection rejects writes in read transact", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        await expect(
            db.transact(["files"], "r", (tx) => tx.collection("files").put({ key: "x", storedAt: 1, bytes: 0, meta: {} })),
        ).rejects.toThrow(/read-only/)
        await db.close()
    })

    it("flush inside read transact does not persist batch puts", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let putSpy = vi.spyOn(IDBObjectStore.prototype, "put")
        await col.put({ key: "b", storedAt: 1, bytes: 0, meta: {} }, { flush: "batch" })
        expect(putSpy).not.toHaveBeenCalled()
        await db.transact(["files"], "r", (tx) => tx.flush())
        expect(putSpy).not.toHaveBeenCalled()
        expect(await col.get("b")).toMatchObject({ key: "b" })
        await db.flush()
        expect(putSpy).toHaveBeenCalledTimes(1)
        expect(await col.get("b")).toMatchObject({ key: "b" })
        await db.close()
    })

    it("does not statically import node:async_hooks or node:module", () => {
        let src = readFileSync(join(here, "driver.ts"), "utf8")
        expect(src).not.toMatch(/node:async_hooks/)
        expect(src).not.toMatch(/node:module/)
    })

    it("close waits for in-flight transact", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let order: string[] = []
        let started!: () => void
        let startedP = new Promise<void>((resolve) => {
            started = resolve
        })
        let release!: () => void
        let gate = new Promise<void>((resolve) => {
            release = resolve
        })
        let txP = db.transact(["files"], "rw", async () => {
            order.push("tx-start")
            started()
            await gate
            order.push("tx-end")
        })
        await startedP
        let closeP = db.close().then(() => {
            order.push("closed")
        })
        await new Promise((r) => setTimeout(r, 20))
        expect(order).toEqual(["tx-start"])
        release()
        await Promise.all([txP, closeP])
        expect(order).toEqual(["tx-start", "tx-end", "closed"])
    })

    it("tx.close from inside transact does not hang", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let result = await Promise.race([
            db
                .transact(["files"], "rw", async (tx) => {
                    await tx.close()
                })
                .then(
                    () => "ok" as const,
                    (err: unknown) => err,
                ),
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
        ])
        expect(result).toBe("ok")
    })

    it("outer db.close from inside transact does not hang", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let result = await Promise.race([
            db
                .transact(["files"], "rw", async () => {
                    await db.close()
                })
                .then(
                    () => "ok" as const,
                    (err: unknown) => err,
                ),
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
        ])
        expect(result).toBe("ok")
    })

    it("scan uses injected IDBKeyRange", async () => {
        let bound = vi.fn((...args: Parameters<typeof IDBKeyRange.bound>) => IDBKeyRange.bound(...args))
        let KeyRange = {
            bound,
            lowerBound: IDBKeyRange.lowerBound.bind(IDBKeyRange),
            upperBound: IDBKeyRange.upperBound.bind(IDBKeyRange),
            only: IDBKeyRange.only.bind(IDBKeyRange),
        } as unknown as typeof IDBKeyRange
        let driver = createIdbDriver({ dbName: nextName(), IDBKeyRange: KeyRange })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await col.put(fileRow({ key: "a", storedAt: 1, bytes: 1 }))
        await col.scan("by-evict", { gte: [0, 0], lte: [10, 10], keysOnly: true })
        expect(bound).toHaveBeenCalled()
        await db.close()
    })

    it("nested transact throws", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        await expect(
            db.transact(["files"], "rw", async (inner) => {
                await inner.transact(["files"], "rw", async () => undefined)
            }),
        ).rejects.toThrow()
        await db.close()
    })

    it("outer transact from inside a transact throws nested, does not hang", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let result = await Promise.race([
            db
                .transact(["files"], "rw", async () => {
                    await db.transact(["files"], "rw", async () => undefined)
                })
                .then(
                    () => "ok" as const,
                    (err: unknown) => err,
                ),
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
        ])
        expect(result).toBeInstanceOf(Error)
        expect((result as Error).message).toMatch(/nested transact/)
        await db.close()
    })

    it("drop then open is empty", async () => {
        let dbName = nextName()
        let driver = createIdbDriver({ dbName })
        let db = await driver.open(schema)
        await db.collection<FileRow>("files").put(fileRow({ key: "a", storedAt: 1, bytes: 1 }))
        await db.collection<ContactRow>("contacts").put({ id: "c1", name: "Ada" })
        await db.close()
        await driver.drop!(schema)
        let db2 = await driver.open(schema)
        expect(await db2.collection<FileRow>("files").count()).toBe(0)
        expect(await db2.collection<ContactRow>("contacts").count()).toBe(0)
        await db2.close()
    })

    it("optional log is accepted", async () => {
        let driver = createIdbDriver({ dbName: nextName(), log: makeSilentLog() })
        let db = await driver.open(schema)
        await db.collection<FileRow>("files").put(fileRow({ key: "a" }))
        expect(await db.collection<FileRow>("files").get("a")).toEqual(fileRow({ key: "a" }))
        await db.close()
    })

    it("getMany preserves key order; missing → null", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let a = fileRow({ key: "a" })
        await col.put(a)
        expect(await col.getMany(["a", "missing", "a"])).toEqual([a, null, a])
        await db.close()
    })

    it("scan __pk walks primary keys in key order", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let c = fileRow({ key: "c" })
        let a = fileRow({ key: "a" })
        let b = fileRow({ key: "b" })
        await col.putMany([c, a, b])
        let hits = await col.scan("__pk")
        expect(hits.map((h) => h.primaryKey)).toEqual(["a", "b", "c"])
        expect(hits[0]?.value).toEqual(a)
        await db.close()
    })

    it("unknown collection / unknown index throws", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        expect(() => db.collection("nope")).toThrow()
        let col = db.collection<FileRow>("files")
        await expect(col.scan("nope")).rejects.toThrow()
        await db.close()
    })

    it("deferPut false writes batch puts now", async () => {
        let driver = createIdbDriver({ dbName: nextName(), deferPut: () => false })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let row = fileRow({ key: "a", storedAt: 1 })
        let putSpy = vi.spyOn(IDBObjectStore.prototype, "put")
        await col.put(row, { flush: "batch" })
        expect(putSpy).toHaveBeenCalledTimes(1)
        expect(await col.get("a")).toEqual(row)
        await db.close()
    })

    it("transact commit flushes batch puts", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let row = fileRow({ key: "a", storedAt: 3, bytes: 9 })
        let putSpy = vi.spyOn(IDBObjectStore.prototype, "put")
        await col.put(row, { flush: "batch" })
        expect(putSpy).not.toHaveBeenCalled()
        await db.transact(["files"], "rw", async () => undefined)
        expect(putSpy).toHaveBeenCalledTimes(1)
        expect(await col.get("a")).toEqual(row)
        await db.close()
    })

    it("flush writes pending rows for multiple collections in one tx", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        await db.collection<FileRow>("files").put(fileRow({ key: "a" }), { flush: "batch" })
        await db.collection<ContactRow>("contacts").put({ id: "c1", name: "Ada" }, { flush: "batch" })
        let txSpy = vi.spyOn(IDBDatabase.prototype, "transaction")
        txSpy.mockClear()
        await db.flush()
        expect(txSpy).toHaveBeenCalledTimes(1)
        expect(txSpy.mock.calls[0]?.[0]).toEqual(["files", "contacts"])
        expect(await db.collection<FileRow>("files").get("a")).toEqual(fileRow({ key: "a" }))
        expect(await db.collection<ContactRow>("contacts").get("c1")).toEqual({ id: "c1", name: "Ada" })
        await db.close()
    })

    it("flush does not resurrect a pk deleted concurrently", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let row = fileRow({ key: "a", storedAt: 1, bytes: 1 })
        await col.put(row, { flush: "batch" })
        let flushP = db.flush()
        await Promise.resolve()
        await col.delete(["a"])
        await flushP
        expect(await col.get("a")).toBeNull()
        await db.close()
    })

    it("flush does not overwrite a concurrent put-now of the same pk", async () => {
        let driver = createIdbDriver({ dbName: nextName() })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let oldRow = fileRow({ key: "a", storedAt: 1, bytes: 1, meta: { n: 1 } })
        let newRow = fileRow({ key: "a", storedAt: 2, bytes: 2, meta: { n: 2 } })
        await col.put(oldRow, { flush: "batch" })
        let flushP = db.flush()
        await Promise.resolve()
        await col.put(newRow)
        await flushP
        expect(await col.get("a")).toEqual(newRow)
        await db.close()
    })

    it("drop completes while another live connection is open", async () => {
        let dbName = nextName()
        let opener = createIdbDriver({ dbName })
        let dropper = createIdbDriver({ dbName })
        let live = await opener.open(schema)
        await live.collection<FileRow>("files").put(fileRow({ key: "a", storedAt: 1, bytes: 1 }))
        await expect(dropper.drop!(schema)).resolves.toBeUndefined()
        let db2 = await dropper.open(schema)
        expect(await db2.collection<FileRow>("files").count()).toBe(0)
        await db2.close()
    }, 2000)

    it("open with a higher version completes while a connection is live", async () => {
        let dbName = nextName()
        let first = createIdbDriver({ dbName })
        let live = await first.open(schema)
        await live.collection<FileRow>("files").put(fileRow({ key: "a", storedAt: 1, bytes: 1 }))
        let second = createIdbDriver({ dbName })
        let upgraded = { ...schema, version: 2 }
        let db2 = await second.open(upgraded)
        expect(await db2.collection<FileRow>("files").get("a")).toEqual(fileRow({ key: "a", storedAt: 1, bytes: 1 }))
        await db2.close()
    }, 2000)

    it("count with pending batch puts does not call getAllKeys", async () => {
        let driver = createIdbDriver({ dbName: nextName(), deferPut: () => true })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        for (let i = 0; i < 80; i++) await col.put(fileRow({ key: `k${i}` }))
        await col.put(fileRow({ key: "pending-a" }), { flush: "batch" })
        await col.put(fileRow({ key: "k0", storedAt: 9 }), { flush: "batch" })
        let getAllKeys = vi.spyOn(IDBObjectStore.prototype, "getAllKeys")
        expect(await col.count()).toBe(81)
        expect(getAllKeys).not.toHaveBeenCalled()
        await db.close()
    })

    it("getMany of only pending keys does not open an IDB transaction", async () => {
        let driver = createIdbDriver({ dbName: nextName(), deferPut: () => true })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await col.put(fileRow({ key: "a" }), { flush: "batch" })
        await col.put(fileRow({ key: "b" }), { flush: "batch" })
        let tx = vi.spyOn(IDBDatabase.prototype, "transaction")
        tx.mockClear()
        expect((await col.getMany(["b", "a", "b"])).map((r) => r?.key)).toEqual(["b", "a", "b"])
        expect(tx).not.toHaveBeenCalled()
        await db.close()
    })

    it("scan limit with pending merges overlay and keeps cursor early-stop", async () => {
        let driver = createIdbDriver({ dbName: nextName(), deferPut: () => true })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await col.putMany([fileRow({ key: "a" }), fileRow({ key: "b" }), fileRow({ key: "c" }), fileRow({ key: "d" })])
        await col.put(fileRow({ key: "0pending" }), { flush: "batch" })
        let getAll = vi.spyOn(IDBObjectStore.prototype, "getAll")
        let getAllKeys = vi.spyOn(IDBObjectStore.prototype, "getAllKeys")
        let continueSpy = vi.spyOn(IDBCursor.prototype, "continue")
        let hits = await col.scan("__pk", { keysOnly: true, limit: 2 })
        expect(hits.map((h) => h.primaryKey)).toEqual(["0pending", "a"])
        expect(hits).toHaveLength(2)
        expect(getAll).not.toHaveBeenCalled()
        expect(getAllKeys).not.toHaveBeenCalled()
        expect(continueSpy.mock.calls.length).toBeLessThan(4)
        await db.close()
    })
})
