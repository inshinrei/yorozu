import { describe, expect, it } from "vitest"
import { createTestLog } from "@yorozu/log"
import { mutableClock } from "./_contract"
import { openMemoryOutbox } from "./memory"
import { OUTBOX_MAX_FAILED, OUTBOX_MAX_FAILED_AGE_MS, pruneOutboxFailed } from "./prune"

describe("pruneOutboxFailed", () => {
    it("exports 90d / 200 defaults", () => {
        expect(OUTBOX_MAX_FAILED_AGE_MS).toBe(90 * 24 * 60 * 60 * 1000)
        expect(OUTBOX_MAX_FAILED).toBe(200)
    })

    it("drops failed entries older than OUTBOX_MAX_FAILED_AGE_MS using the injected clock", async () => {
        let clock = mutableClock(1_000)
        let store = openMemoryOutbox({ clock })
        let pendingId = await store.enqueue({ type: "pending", payload: {} })
        let oldId = await store.enqueue({ type: "f", payload: {} })
        await store.markFailed(oldId)
        clock.nowMs = 1_000 + OUTBOX_MAX_FAILED_AGE_MS + 50
        let youngId = await store.enqueue({ type: "f2", payload: {} })
        await store.markFailed(youngId)

        await pruneOutboxFailed(store, createTestLog(), { clock })

        expect(await store.get(oldId)).toBeNull()
        expect(await store.get(youngId)).not.toBeNull()
        expect(await store.get(pendingId)).not.toBeNull()
        expect((await store.get(pendingId))!.failedAt).toBeUndefined()
    })

    it("does not use Date.now when a clock is injected", async () => {
        let real = Date.now()
        let clock = mutableClock(real - OUTBOX_MAX_FAILED_AGE_MS - 10_000)
        let store = openMemoryOutbox({ clock })
        let id = await store.enqueue({ type: "f", payload: {} })
        await store.markFailed(id)
        clock.nowMs += 1_000

        await pruneOutboxFailed(store, createTestLog(), { clock })

        expect(await store.get(id)).not.toBeNull()
    })

    it("caps failed to OUTBOX_MAX_FAILED keeping newest", async () => {
        let clock = mutableClock(1_000)
        let store = openMemoryOutbox({ clock })
        let ids: string[] = []
        for (let i = 0; i < OUTBOX_MAX_FAILED + 5; i++) {
            let id = await store.enqueue({ type: "f", payload: { i } })
            ids.push(id)
            await store.markFailed(id)
            clock.nowMs += 100
        }

        await pruneOutboxFailed(store, createTestLog(), { clock })

        let left = await store.listFailed()
        expect(left.length).toBe(OUTBOX_MAX_FAILED)
        expect(left.some((e) => e.id === ids[ids.length - 1])).toBe(true)
        expect(left.some((e) => e.id === ids[0])).toBe(false)
    })

    it("honors custom maxAgeMs and maxCount", async () => {
        let clock = mutableClock(10_000)
        let store = openMemoryOutbox({ clock })
        let aged = await store.enqueue({ type: "old", payload: {} })
        await store.markFailed(aged)
        clock.nowMs = 10_000 + 5_000
        let a = await store.enqueue({ type: "a", payload: {} })
        await store.markFailed(a)
        clock.nowMs += 10
        let b = await store.enqueue({ type: "b", payload: {} })
        await store.markFailed(b)
        clock.nowMs += 10
        let c = await store.enqueue({ type: "c", payload: {} })
        await store.markFailed(c)

        await pruneOutboxFailed(store, createTestLog(), { clock, maxAgeMs: 4_000, maxCount: 2 })

        expect(await store.get(aged)).toBeNull()
        let left = await store.listFailed()
        expect(left.map((e) => e.id).sort()).toEqual([b, c].sort())
    })

    it("never deletes a non-failed entry even when over the failed cap", async () => {
        let clock = mutableClock()
        let store = openMemoryOutbox({ clock })
        let pendingId = await store.enqueue({ type: "send", payload: {} })
        for (let i = 0; i < 10; i++) {
            let fid = await store.enqueue({ type: "f", payload: { i } })
            await store.markFailed(fid)
        }

        await pruneOutboxFailed(store, createTestLog(), { clock, maxCount: 2 })

        let pending = await store.get(pendingId)
        expect(pending).not.toBeNull()
        expect(pending!.failedAt).toBeUndefined()
    })
})
