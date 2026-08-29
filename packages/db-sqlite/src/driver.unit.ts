import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"
import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"
import { compareIndexKey, type DbSchema } from "@yorozu/db"
import { makeSilentLog } from "@yorozu/log"
import { createSqliteDriver } from "./driver"

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
    blob?: Blob | Uint8Array
    meta: Record<string, unknown>
}

type ContactRow = { id: string; name: string }

function fileRow(partial: Partial<FileRow> & Pick<FileRow, "key">): FileRow {
    return {
        storedAt: 0,
        bytes: 0,
        meta: {},
        ...partial,
    }
}

function nativeWithLog(log: string[]): typeof Database {
    return function Recording(filename: string, options?: Database.Options) {
        let db = new Database(filename, options)
        let prepare = db.prepare.bind(db)
        db.prepare = ((sql: string) => {
            log.push(sql)
            return prepare(sql)
        }) as typeof db.prepare
        let exec = db.exec.bind(db)
        db.exec = ((sql: string) => {
            log.push(sql)
            return exec(sql)
        }) as typeof db.exec
        return db
    } as unknown as typeof Database
}

describe("createSqliteDriver", () => {
    it("put/get roundtrips Blob when Blob exists", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let blob = new Blob(["hello-blob"])
        let row = fileRow({ key: "a", storedAt: 1, bytes: 10, blob, meta: { k: 1 } })
        await col.put(row)
        let got = await col.get("a")
        expect(got).not.toBeNull()
        expect(got!.key).toBe("a")
        expect(got!.storedAt).toBe(1)
        expect(got!.bytes).toBe(10)
        expect(got!.meta).toEqual({ k: 1 })
        expect(got!.blob).toBeInstanceOf(Blob)
        expect(await (got!.blob as Blob).text()).toBe("hello-blob")
        expect(await col.get("missing")).toBeNull()
        expect(await col.count()).toBe(1)
        expect(db.schema).toEqual(schema)
        expect(col.name).toBe("files")
        await db.close()
    })

    it("keysOnly scan does not SELECT payload or blobs", async () => {
        let sql: string[] = []
        let driver = createSqliteDriver({ filename: ":memory:", native: nativeWithLog(sql) })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let blob = new Blob(["hello-blob"])
        await col.putMany([
            fileRow({ key: "old", storedAt: 19, bytes: 99, blob }),
            fileRow({ key: "edge", storedAt: 20, bytes: 8, blob }),
            fileRow({ key: "new", storedAt: 21, bytes: 1, blob }),
        ])
        sql.length = 0
        let hits = await col.scan("by-evict", { keysOnly: true, lt: [20] })
        expect(hits.map((h) => h.primaryKey)).toEqual(["old"])
        expect(hits[0]?.indexKey).toEqual([19, 99])
        expect(hits[0]).not.toHaveProperty("value")
        expect(hits[0]?.value).toBeUndefined()
        let scanSql = sql.join("\n")
        expect(scanSql.toLowerCase()).not.toMatch(/payload/)
        expect(scanSql.toLowerCase()).not.toMatch(/__blobs/)
        await db.close()
    })

    it("prefix bound excludes storedAt === cutoff", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
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

    it("getMany preserves key order; putMany writes all rows", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let a = fileRow({ key: "a", storedAt: 1 })
        let b = fileRow({ key: "b", storedAt: 2 })
        await col.putMany([a, b])
        expect(await col.get("a")).toEqual(a)
        expect(await col.get("b")).toEqual(b)
        expect(await col.getMany(["a", "missing", "a"])).toEqual([a, null, a])
        expect(await col.count()).toBe(2)
        await db.close()
    })

    it("nested transact throws", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        await expect(
            db.transact(["files"], "rw", async (inner) => {
                await inner.transact(["files"], "rw", async () => undefined)
            }),
        ).rejects.toThrow()
        await db.close()
    })

    it("outer transact from inside a transact throws nested, does not hang", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
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

    it("drop on :memory: is safe", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        await db.collection<FileRow>("files").put(fileRow({ key: "a" }))
        await expect(driver.drop!(schema)).resolves.toBeUndefined()
    })

    it("keysOnly scan does not read blob sidecar (large Uint8Array is fast)", async () => {
        let sql: string[] = []
        let driver = createSqliteDriver({ filename: ":memory:", native: nativeWithLog(sql) })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let blob = new Uint8Array(8 * 1024 * 1024)
        blob[0] = 7
        blob[blob.length - 1] = 9
        await col.put(fileRow({ key: "big", storedAt: 1, bytes: blob.byteLength, blob }))
        sql.length = 0
        let start = performance.now()
        let hits = await col.scan("by-evict", { keysOnly: true })
        let elapsed = performance.now() - start
        expect(hits.map((h) => h.primaryKey)).toEqual(["big"])
        expect(hits[0]).not.toHaveProperty("value")
        expect(sql.join("\n").toLowerCase()).not.toMatch(/payload/)
        expect(sql.join("\n").toLowerCase()).not.toMatch(/__blobs/)
        expect(elapsed).toBeLessThan(100)
        await db.close()
    })

    it("optional log is accepted", async () => {
        let driver = createSqliteDriver({ filename: ":memory:", log: makeSilentLog() })
        let db = await driver.open(schema)
        await db.collection<FileRow>("files").put(fileRow({ key: "a" }))
        expect(await db.collection<FileRow>("files").get("a")).toEqual(fileRow({ key: "a" }))
        await db.close()
    })

    it("transact serializes rw", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let order: string[] = []
        let started!: () => void
        let startedP = new Promise<void>((resolve) => {
            started = resolve
        })
        let p1 = db.transact(["files"], "rw", async (inner) => {
            order.push("start-1")
            started()
            await new Promise((r) => setTimeout(r, 20))
            await inner.collection<FileRow>("files").put(fileRow({ key: "a" }))
            order.push("end-1")
        })
        await startedP
        let p2 = db.transact(["files"], "rw", async (inner) => {
            order.push("start-2")
            await inner.collection<FileRow>("files").put(fileRow({ key: "b" }))
            order.push("end-2")
        })
        await Promise.all([p1, p2])
        expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"])
        await db.close()
    })

    it("transact rolls back on throw", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await expect(
            db.transact(["files"], "rw", async (inner) => {
                await inner.collection<FileRow>("files").put(fileRow({ key: "a", storedAt: 1 }))
                throw new Error("boom")
            }),
        ).rejects.toThrow("boom")
        expect(await col.get("a")).toBeNull()
        await db.close()
    })

    it("outside put during transact await is not rolled back with that tx", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let started!: () => void
        let startedP = new Promise<void>((resolve) => {
            started = resolve
        })
        let txP = db.transact(["files"], "rw", async (inner) => {
            await inner.collection<FileRow>("files").put(fileRow({ key: "tx", storedAt: 1 }))
            started()
            await new Promise((r) => setTimeout(r, 30))
            throw new Error("boom")
        })
        await startedP
        let outerP = col.put(fileRow({ key: "outer", storedAt: 2 }))
        await expect(txP).rejects.toThrow("boom")
        await outerP
        expect(await col.get("tx")).toBeNull()
        expect(await col.get("outer")).toEqual(fileRow({ key: "outer", storedAt: 2 }))
        await db.close()
    })

    it("outside delete during transact await is not rolled back with that tx", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await col.put(fileRow({ key: "keep", storedAt: 1 }))
        let started!: () => void
        let startedP = new Promise<void>((resolve) => {
            started = resolve
        })
        let txP = db.transact(["files"], "rw", async (inner) => {
            await inner.collection<FileRow>("files").put(fileRow({ key: "tx", storedAt: 1 }))
            started()
            await new Promise((r) => setTimeout(r, 30))
            throw new Error("boom")
        })
        await startedP
        let delP = col.delete(["keep"])
        await expect(txP).rejects.toThrow("boom")
        await delP
        expect(await col.get("tx")).toBeNull()
        expect(await col.get("keep")).toBeNull()
        await db.close()
    })

    it("pre-obtained collection inside transact joins the SQL tx and rolls back", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let result = await Promise.race([
            db
                .transact(["files"], "rw", async () => {
                    await col.put(fileRow({ key: "a", storedAt: 1 }))
                    throw new Error("boom")
                })
                .then(
                    () => "committed" as const,
                    (err: unknown) => err,
                ),
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
        ])
        expect(result).toBeInstanceOf(Error)
        expect((result as Error).message).toBe("boom")
        expect(await col.get("a")).toBeNull()
        await db.close()
    })

    it("string-key scan with limit follows compareIndexKey not SQL UTF-8 order", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<ContactRow>("contacts")
        let ascii = { id: "a", name: "ascii" }
        let bmp = { id: "\uFFFF", name: "bmp" }
        let astral = { id: "\u{10000}", name: "astral" }
        await col.putMany([bmp, astral, ascii])
        expect(compareIndexKey("a", "\u{10000}")).toBe(-1)
        expect(compareIndexKey("\u{10000}", "\uFFFF")).toBe(-1)
        let hits = await col.scan("__pk", { gte: "a", limit: 2, keysOnly: true })
        expect(hits.map((h) => h.primaryKey)).toEqual(["a", "\u{10000}"])
        await db.close()
    })

    it("lte BMP string bound includes UTF-16 astral even though SQLite UTF-8 would exclude it", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<ContactRow>("contacts")
        let ascii = { id: "a", name: "ascii" }
        let bmp = { id: "\uFFFF", name: "bmp" }
        let astral = { id: "\u{10000}", name: "astral" }
        await col.putMany([bmp, astral, ascii])
        expect(compareIndexKey("\u{10000}", "\uFFFF")).toBe(-1)
        let hits = await col.scan("__pk", { lte: "\uFFFF", keysOnly: true })
        expect(hits.map((h) => h.primaryKey)).toEqual(["a", "\u{10000}", "\uFFFF"])
        await db.close()
    })

    it("transact r rejects writes and allows reads", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let a = fileRow({ key: "a", storedAt: 1 })
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
        let driver = createSqliteDriver({ filename: ":memory:" })
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

    it("pre-obtained collection put inside read transact is allowed", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let result = await Promise.race([
            db
                .transact(["files"], "r", async () => {
                    await col.put({ key: "a", storedAt: 1, bytes: 0, meta: {} })
                })
                .then(
                    () => "ok" as const,
                    (err: unknown) => err,
                ),
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
        ])
        expect(result).toBe("ok")
        expect(await col.get("a")).toMatchObject({ key: "a" })
        await db.close()
    })

    it("callback collection rejects writes in read transact", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        await expect(
            db.transact(["files"], "r", (tx) => tx.collection("files").put({ key: "x", storedAt: 1, bytes: 0, meta: {} })),
        ).rejects.toThrow(/read-only/)
        await db.close()
    })

    it("flush inside read transact does not persist batch puts", async () => {
        let sql: string[] = []
        let driver = createSqliteDriver({ filename: ":memory:", native: nativeWithLog(sql) })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await col.put({ key: "b", storedAt: 1, bytes: 0, meta: {} }, { flush: "batch" })
        sql.length = 0
        await db.transact(["files"], "r", (tx) => tx.flush())
        expect(sql.some((s) => /INSERT OR REPLACE/i.test(s))).toBe(false)
        expect(await col.get("b")).toMatchObject({ key: "b" })
        await db.flush()
        expect(await col.get("b")).toMatchObject({ key: "b" })
        await db.close()
    })

    it("async transact uses BEGIN IMMEDIATE", async () => {
        let sql: string[] = []
        let driver = createSqliteDriver({ filename: ":memory:", native: nativeWithLog(sql) })
        let db = await driver.open(schema)
        sql.length = 0
        await db.transact(["files"], "rw", async () => undefined)
        expect(sql.some((s) => /BEGIN IMMEDIATE/i.test(s))).toBe(true)
        expect(sql.some((s) => /COMMIT/i.test(s))).toBe(true)
        await db.close()
    })

    it("flush coalesces two batch puts of the same pk to the last row", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let first = fileRow({ key: "a", storedAt: 1, bytes: 1, meta: { n: 1 } })
        let last = fileRow({ key: "a", storedAt: 2, bytes: 2, meta: { n: 2 } })
        await col.put(first, { flush: "batch" })
        await col.put(last, { flush: "batch" })
        expect(await col.get("a")).toEqual(last)
        await db.flush()
        expect(await col.get("a")).toEqual(last)
        await db.close()
    })

    it("transact commit flushes batch puts", async () => {
        let sql: string[] = []
        let driver = createSqliteDriver({ filename: ":memory:", native: nativeWithLog(sql) })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let row = fileRow({ key: "a", storedAt: 3, bytes: 9 })
        await col.put(row, { flush: "batch" })
        sql.length = 0
        await db.transact(["files"], "rw", async () => undefined)
        expect(sql.some((s) => /INSERT OR REPLACE/i.test(s))).toBe(true)
        expect(await col.get("a")).toEqual(row)
        await db.close()
    })

    it("scan __pk walks primary keys in key order", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
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
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        expect(() => db.collection("nope")).toThrow()
        let col = db.collection<FileRow>("files")
        await expect(col.scan("nope")).rejects.toThrow()
        await db.close()
    })

    it("illegal identifier names throw", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        await expect(
            driver.open({
                name: "t",
                version: 1,
                collections: [{ name: "oh no", keyPath: "id" }],
            }),
        ).rejects.toThrow(/illegal identifier/)
        await expect(
            driver.open({
                name: "t",
                version: 1,
                collections: [{ name: "ok", keyPath: "id", indexes: [{ name: "bad.name", keyPath: "id" }] }],
            }),
        ).rejects.toThrow(/illegal identifier/)
    })

    it("Uint8Array rehydrates as Blob when Blob exists", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        await col.put(fileRow({ key: "a", blob: new Uint8Array([1, 2, 3]) }))
        let got = await col.get("a")
        expect(got?.blob).toBeInstanceOf(Blob)
        expect(new Uint8Array(await (got!.blob as Blob).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
        await db.close()
    })

    it("delete / clear / getAll", async () => {
        let driver = createSqliteDriver({ filename: ":memory:" })
        let db = await driver.open(schema)
        let col = db.collection<FileRow>("files")
        let a = fileRow({ key: "a", storedAt: 1 })
        let b = fileRow({ key: "b", storedAt: 2 })
        await col.putMany([a, b])
        expect(await col.getAll()).toEqual([a, b])
        await col.delete(["a"])
        expect(await col.get("a")).toBeNull()
        expect(await col.count()).toBe(1)
        await col.clear()
        expect(await col.count()).toBe(0)
        await db.close()
    })

    it("drop unlinks a file database", async () => {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-db-sqlite-"))
        let filename = join(dir, "t.sqlite")
        try {
            let driver = createSqliteDriver({ filename })
            let db = await driver.open(schema)
            await db.collection<FileRow>("files").put(fileRow({ key: "a", storedAt: 1 }))
            await db.collection<ContactRow>("contacts").put({ id: "c1", name: "Ada" })
            await db.close()
            expect(existsSync(filename)).toBe(true)
            await driver.drop!(schema)
            expect(existsSync(filename)).toBe(false)
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})
