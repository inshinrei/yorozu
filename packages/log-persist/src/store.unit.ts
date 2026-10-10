import { afterEach, describe, expect, it } from "vitest"
import { openMemoryDb, type Db } from "@yorozu/db"
import type { LogRecord } from "@yorozu/log"
import { LOG_COLLECTION, logPersistSchema } from "./schema"
import { openLogStore } from "./store"
import type { LogRow, LogStore, LogStoreOpts } from "./store"

let dbs: Db[] = []

afterEach(async () => {
    for (let db of dbs) await db.close()
    dbs = []
})

async function openStore(opts?: LogStoreOpts): Promise<{ db: Db; store: LogStore }> {
    let db = await openMemoryDb(logPersistSchema)
    dbs.push(db)
    return { db, store: openLogStore(db, opts) }
}

function rec(partial: Partial<LogRecord> = {}): LogRecord {
    return {
        subsystem: "app",
        category: "core",
        level: "info",
        msg: "hello",
        arguments: {},
        timestamp: 1_000,
        ...partial,
    }
}

async function storedRows(db: Db): Promise<LogRow[]> {
    return db.collection<LogRow & Record<string, unknown>>(LOG_COLLECTION).getAll()
}

describe("openLogStore", () => {
    it("throws if the logs collection is missing", async () => {
        let db = await openMemoryDb({
            name: "other",
            version: 1,
            collections: [{ name: "not-logs", keyPath: "id" }],
        })
        dbs.push(db)
        expect(() => openLogStore(db)).toThrow("unknown collection: logs")
    })

    it("appends via handler and query returns a cloned record", async () => {
        let { db, store } = await openStore()
        let args = { a: 1 }
        store.handler(rec({ arguments: args }))
        args.a = 2
        await store.flush()
        expect(await store.query()).toEqual([rec({ arguments: { a: 1 } })])
        let rows = await storedRows(db)
        expect(rows).toHaveLength(1)
        expect(rows[0]!.id).toMatch(/^1000-\d+$/)
    })

    it("assigns distinct ids when timestamps match", async () => {
        let { db, store } = await openStore()
        store.handler(rec({ msg: "a" }))
        store.handler(rec({ msg: "b" }))
        await store.flush()
        let ids = (await storedRows(db)).map((row) => row.id)
        expect(ids).toHaveLength(2)
        expect(new Set(ids).size).toBe(2)
    })

    it("query by subsystem excludes other subsystems", async () => {
        let { store } = await openStore()
        store.handler(rec({ subsystem: "outbox", msg: "a" }))
        store.handler(rec({ subsystem: "db", msg: "b", timestamp: 1001 }))
        await store.flush()
        expect((await store.query({ subsystem: "outbox" })).map((row) => row.msg)).toEqual(["a"])
    })

    it("query by subsystem and category excludes other categories", async () => {
        let { store } = await openStore()
        store.handler(rec({ subsystem: "outbox", category: "worker", msg: "a" }))
        store.handler(rec({ subsystem: "outbox", category: "store", msg: "b", timestamp: 1001 }))
        store.handler(rec({ subsystem: "db", category: "worker", msg: "c", timestamp: 1002 }))
        await store.flush()
        expect((await store.query({ subsystem: "outbox", category: "worker" })).map((row) => row.msg)).toEqual(["a"])
    })

    it("query by category without subsystem filters in memory", async () => {
        let { store } = await openStore()
        store.handler(rec({ subsystem: "a", category: "worker", msg: "a" }))
        store.handler(rec({ subsystem: "b", category: "store", msg: "b", timestamp: 1001 }))
        store.handler(rec({ subsystem: "c", category: "worker", msg: "c", timestamp: 1002 }))
        await store.flush()
        expect((await store.query({ category: "worker" })).map((row) => row.msg)).toEqual(["a", "c"])
    })

    it("query by single level and by level list", async () => {
        let { store } = await openStore()
        store.handler(rec({ level: "info", msg: "i" }))
        store.handler(rec({ level: "error", msg: "e", timestamp: 1001 }))
        store.handler(rec({ level: "fault", msg: "f", timestamp: 1002 }))
        await store.flush()
        expect((await store.query({ level: "error" })).map((row) => row.msg)).toEqual(["e"])
        expect((await store.query({ level: ["error", "fault"] })).map((row) => row.msg)).toEqual(["e", "f"])
    })

    it("query since/until is timestamp >= since and timestamp < until", async () => {
        let { store } = await openStore()
        store.handler(rec({ timestamp: 100, msg: "a" }))
        store.handler(rec({ timestamp: 200, msg: "b" }))
        store.handler(rec({ timestamp: 300, msg: "c" }))
        await store.flush()
        expect((await store.query({ since: 200, until: 300 })).map((row) => row.msg)).toEqual(["b"])
        expect((await store.query({ since: 200 })).map((row) => row.msg)).toEqual(["b", "c"])
        expect((await store.query({ until: 200 })).map((row) => row.msg)).toEqual(["a"])
    })

    it("query limit with direction rev is newest first", async () => {
        let { store } = await openStore()
        store.handler(rec({ timestamp: 1, msg: "a" }))
        store.handler(rec({ timestamp: 2, msg: "b" }))
        store.handler(rec({ timestamp: 3, msg: "c" }))
        await store.flush()
        expect((await store.query({ limit: 2, direction: "rev" })).map((row) => row.msg)).toEqual(["c", "b"])
    })

    it("applies limit after in-memory level filtering", async () => {
        let { store } = await openStore()
        store.handler(rec({ level: "info", timestamp: 1, msg: "i1" }))
        store.handler(rec({ level: "error", timestamp: 2, msg: "e1" }))
        store.handler(rec({ level: "error", timestamp: 3, msg: "e2" }))
        store.handler(rec({ level: "error", timestamp: 4, msg: "e3" }))
        await store.flush()
        expect((await store.query({ level: "error", limit: 2 })).map((row) => row.msg)).toEqual(["e1", "e2"])
    })

    it("clear then query is empty", async () => {
        let { store } = await openStore()
        store.handler(rec())
        await store.flush()
        await store.clear()
        expect(await store.query()).toEqual([])
    })

    it("rotates by maxCount after appends", async () => {
        let { store } = await openStore({
            maxCount: 3,
            rotateEvery: 1,
            clock: { now: () => 10_000 },
        })
        for (let i = 0; i < 5; i++) {
            store.handler(rec({ timestamp: 1000 + i, msg: String(i) }))
        }
        await store.flush()
        expect((await store.query()).map((row) => row.msg)).toEqual(["2", "3", "4"])
    })

    it("rotates by maxAge using the injected clock", async () => {
        let now = 10_000
        let { store } = await openStore({
            maxAgeMs: 1000,
            rotateEvery: 1,
            clock: { now: () => now },
        })
        store.handler(rec({ timestamp: 8_000, msg: "old" }))
        store.handler(rec({ timestamp: 9_500, msg: "new" }))
        await store.flush()
        expect((await store.query()).map((row) => row.msg)).toEqual(["new"])
    })

    it("rotate() trims without waiting for rotateEvery", async () => {
        let { store } = await openStore({
            maxCount: 3,
            rotateEvery: 100,
            clock: { now: () => 10_000 },
        })
        for (let i = 0; i < 5; i++) {
            store.handler(rec({ timestamp: 1000 + i, msg: String(i) }))
        }
        await store.flush()
        expect(await store.query()).toHaveLength(5)
        await store.rotate()
        expect((await store.query()).map((row) => row.msg)).toEqual(["2", "3", "4"])
    })

    it("handler does not throw on circular arguments", async () => {
        let { store } = await openStore()
        let circular: Record<string, unknown> = { a: 1 }
        circular.self = circular
        expect(() => store.handler(rec({ arguments: circular }))).not.toThrow()
        await store.flush()
        expect((await store.query())[0]!.arguments).toEqual({ _unserializable: true })
    })
})
