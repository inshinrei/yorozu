import { describe, expect, it, vi } from "vitest"
import { openMemoryDb, type Db } from "@yorozu/db"
import { mutableClock, testOutboxStore } from "./_contract"
import { createOutboxStore } from "./collection-store"
import { outboxCollectionDef } from "./schema"
import type { Clock, OutboxEntry, OutboxStore } from "./types"

type OutboxRow = OutboxEntry & Record<string, unknown>

async function openCollectionOutbox(clock?: Clock): Promise<{ store: OutboxStore; db: Db }> {
    let db = await openMemoryDb({
        name: "outbox-test",
        version: 1,
        collections: [outboxCollectionDef("outbox")],
    })
    let collection = db.collection<OutboxRow>("outbox")
    let store = createOutboxStore({ collection, db, clock })
    return { store, db }
}

describe("outboxCollectionDef", () => {
    it("defaults name outbox with by-claim and by-failed indexes", () => {
        expect(outboxCollectionDef()).toEqual({
            name: "outbox",
            keyPath: "id",
            indexes: [
                { name: "by-claim", keyPath: ["reservedTo", "createdAt"] },
                { name: "by-failed", keyPath: ["failedAt", "createdAt"] },
            ],
        })
        expect(outboxCollectionDef("jobs").name).toBe("jobs")
    })
})

describe("createOutboxStore", () => {
    testOutboxStore(async () => {
        let clock = mutableClock()
        let { store } = await openCollectionOutbox(clock)
        return { store, clock }
    })

    it("enqueue is visible to a subsequent claim in the same process", async () => {
        // enqueue uses _transact so it cannot race claim's scan+put on sqlite/idb
        let clock = mutableClock(1000)
        let { store, db } = await openCollectionOutbox(clock)
        let id = await store.enqueue({ type: "t", payload: 1 })
        let claimed = await store.claim(1000)
        expect(claimed?.id).toBe(id)
        expect(claimed?.payload).toBe(1)
        await db.close()
    })

    it("enqueue, delete, and deleteAll go through transact", async () => {
        let { store, db } = await openCollectionOutbox()
        let transact = vi.spyOn(db, "transact")
        let id = await store.enqueue({ type: "t", payload: 1 })
        expect(transact).toHaveBeenCalledWith(["outbox"], "rw", expect.any(Function))
        transact.mockClear()
        await store.delete(id)
        expect(transact).toHaveBeenCalledWith(["outbox"], "rw", expect.any(Function))
        transact.mockClear()
        await store.deleteAll()
        expect(transact).toHaveBeenCalledWith(["outbox"], "rw", expect.any(Function))
        await db.close()
    })

    it("claim scans by-claim with lte [now, MAX_SAFE_INTEGER] inside transact", async () => {
        let clock = mutableClock(1000)
        let { store, db } = await openCollectionOutbox(clock)
        let col = db.collection<OutboxRow>("outbox")
        let scan = vi.spyOn(col, "scan")
        let transact = vi.spyOn(db, "transact")
        await store.enqueue({ type: "t", payload: {} })
        await store.claim(5000)
        expect(transact).toHaveBeenCalledWith(["outbox"], "rw", expect.any(Function))
        expect(scan).toHaveBeenCalledWith("by-claim", {
            lte: [1000, Number.MAX_SAFE_INTEGER],
            keysOnly: true,
        })
        await db.close()
    })

    it("claim loads one row among many due keysOnly hits", async () => {
        let clock = mutableClock(1000)
        let {store, db} = await openCollectionOutbox(clock)
        let col = db.collection<OutboxRow>("outbox")
        for (let i = 0; i < 40; i++) {
            clock.nowMs = 1000 + i
            await store.enqueue({type: "t", payload: {i, blob: "x".repeat(200)}})
        }
        clock.nowMs = 50_000
        let get = vi.spyOn(col, "get")
        let scan = vi.spyOn(col, "scan")
        let claimed = await store.claim(5000)
        expect(claimed?.attempts).toBe(1)
        expect(scan).toHaveBeenCalledWith(
            "by-claim",
            expect.objectContaining({keysOnly: true, lte: [50_000, Number.MAX_SAFE_INTEGER]}),
        )
        expect(get.mock.calls.length).toBeLessThan(5)
        await db.close()
    })

    it("nextDueAt scans by-claim keysOnly with limit 1", async () => {
        let clock = mutableClock(1000)
        let {store, db} = await openCollectionOutbox(clock)
        for (let i = 0; i < 20; i++) {
            let id = await store.enqueue({type: "f", payload: i})
            await store.claim(1)
            await store.markFailed(id)
        }
        await store.enqueue({type: "live", payload: 1})
        let col = db.collection<OutboxRow>("outbox")
        let scan = vi.spyOn(col, "scan")
        expect(await store.nextDueAt()).toBe(0)
        expect(scan).toHaveBeenCalledWith("by-claim", expect.objectContaining({keysOnly: true, limit: 1}))
        await db.close()
    })

    it("markFailed sets reservedTo MAX so a by-claim due scan does not return it", async () => {
        let clock = mutableClock(1000)
        let { store, db } = await openCollectionOutbox(clock)
        let col = db.collection<OutboxRow>("outbox")
        let id = await store.enqueue({ type: "f", payload: {} })
        await store.claim(1000)
        await store.markFailed(id, "fatal 400")

        let row = await store.get(id)
        expect(row).not.toBeNull()
        expect(row!.failedAt).toBe(1000)
        expect(row!.reservedTo).toBe(Number.MAX_SAFE_INTEGER)
        expect(await store.claim(1000)).toBeNull()
        expect(await store.get(id)).not.toBeNull()

        let due = await col.scan("by-claim", { lte: [clock.now(), Number.MAX_SAFE_INTEGER] })
        expect(due.map((h) => h.primaryKey)).not.toContain(id)

        let failedHits = await col.scan("by-failed")
        expect(failedHits.map((h) => h.primaryKey)).toContain(id)
        await db.close()
    })

    it("omitted log and clock still enqueue and claim", async () => {
        let { store, db } = await openCollectionOutbox()
        let id = await store.enqueue({ type: "t", payload: 1 })
        let claimed = await store.claim(1000)
        expect(claimed).toMatchObject({ id, attempts: 1 })
        await db.close()
    })
})
