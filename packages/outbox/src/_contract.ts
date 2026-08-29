import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Clock, OutboxStore } from "./types"

export type MutableClock = Clock & { nowMs: number }

export function mutableClock(start: number = 1_000_000): MutableClock {
    let clock: MutableClock = {
        nowMs: start,
        now(): number {
            return clock.nowMs
        },
    }
    return clock
}

export function testOutboxStore(factory: () => Promise<{ store: OutboxStore; clock: MutableClock }>): void {
    describe("contract", () => {
        let store: OutboxStore
        let clock: MutableClock

        beforeEach(async () => {
            let opened = await factory()
            store = opened.store
            clock = opened.clock
        })

        afterEach(async () => {
            await store.deleteAll()
        })

        it("is empty by default / returns null", async () => {
            expect(await store.get("nonexistent")).toBeNull()
            expect(await store.claim(1000)).toBeNull()
        })

        it("enqueues and retrieves with defaults (reservedTo=0, attempts=0, no failedAt)", async () => {
            let id = await store.enqueue({
                type: "msg/send",
                payload: { text: "hi" },
                rollbackType: "removeTemp",
                rollbackPayload: { tempId: "t1" },
            })
            expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/)

            let entry = await store.get(id)
            expect(entry).not.toBeNull()
            expect(entry!.id).toBe(id)
            expect(entry!.type).toBe("msg/send")
            expect(entry!.payload).toEqual({ text: "hi" })
            expect(entry!.rollbackType).toBe("removeTemp")
            expect(entry!.rollbackPayload).toEqual({ tempId: "t1" })
            expect(entry!.reservedTo).toBe(0)
            expect(entry!.attempts).toBe(0)
            expect(entry!.createdAt).toBe(clock.nowMs)
            expect(entry!.lastError).toBeUndefined()
            expect(entry!.failedAt).toBeUndefined()
        })

        it("enqueues without rollback fields stores undefined gracefully", async () => {
            let id = await store.enqueue({ type: "plain", payload: { foo: true } })
            let entry = await store.get(id)
            expect(entry?.rollbackType).toBeUndefined()
            expect(entry?.rollbackPayload).toBeUndefined()
        })

        it("enqueue ids are unique at the same timestamp", async () => {
            let a = await store.enqueue({ type: "a", payload: 1 })
            let b = await store.enqueue({ type: "b", payload: 2 })
            expect(a).not.toBe(b)
        })

        it("claims FIFO (oldest createdAt first) and sets reservation + increments attempts", async () => {
            clock.nowMs = 1000
            let id1 = await store.enqueue({ type: "a", payload: 1 })
            clock.nowMs = 1001
            let id2 = await store.enqueue({ type: "b", payload: 2 })

            let claimed = await store.claim(30000)
            expect(claimed?.id).toBe(id1)
            expect(claimed?.reservedTo).toBe(1001 + 30000)
            expect(claimed?.attempts).toBe(1)

            let claimed2 = await store.claim(30000)
            expect(claimed2?.id).toBe(id2)
            expect(claimed2?.attempts).toBe(1)

            expect(await store.claim(1000)).toBeNull()
        })

        it("claim only picks entries whose reservedTo has expired (or 0)", async () => {
            clock.nowMs = 1000
            let id = await store.enqueue({ type: "t", payload: {} })
            let firstClaim = await store.claim(10000)
            expect(firstClaim?.id).toBe(id)
            expect(firstClaim?.reservedTo).toBe(11000)

            expect(await store.claim(5000)).toBeNull()

            clock.nowMs = 11500
            let reclaimed = await store.claim(20000)
            expect(reclaimed?.id).toBe(id)
            expect(reclaimed?.reservedTo).toBe(11500 + 20000)
            expect(reclaimed?.attempts).toBe(2)
        })

        it("claim picks min createdAt among due rows, not min reservedTo", async () => {
            clock.nowMs = 1000
            let older = await store.enqueue({ type: "old", payload: 1 })
            clock.nowMs = 2000
            let newer = await store.enqueue({ type: "new", payload: 2 })
            let first = await store.claim(10)
            expect(first?.id).toBe(older)
            expect(first?.reservedTo).toBe(2010)

            clock.nowMs = 3000
            let second = await store.claim(1000)
            expect(second?.id).toBe(older)
            expect(second?.attempts).toBe(2)

            let third = await store.claim(1000)
            expect(third?.id).toBe(newer)
        })

        it("release makes a reserved entry claimable again immediately", async () => {
            clock.nowMs = 1000
            let id = await store.enqueue({ type: "x", payload: "x" })
            await store.claim(60000)
            expect(await store.claim(1000)).toBeNull()

            await store.release(id)

            let reclaimed = await store.claim(1000)
            expect(reclaimed?.id).toBe(id)
            expect(reclaimed?.reservedTo).toBeGreaterThan(0)
            let held = await store.get(id)
            expect(held?.reservedTo).toBe(1000 + 1000)
        })

        it("updateAfterFailure persists error and can set next reservation", async () => {
            let id = await store.enqueue({ type: "fail", payload: {} })
            await store.claim(1000)
            await store.updateAfterFailure(id, "network timeout", clock.nowMs + 5000)

            let entry = await store.get(id)
            expect(entry?.lastError).toBe("network timeout")
            expect(entry?.reservedTo).toBe(clock.nowMs + 5000)
        })

        it("delete and deleteAll remove entries", async () => {
            let id1 = await store.enqueue({ type: "d1", payload: 1 })
            let id2 = await store.enqueue({ type: "d2", payload: 2 })

            await store.delete(id1)
            expect(await store.get(id1)).toBeNull()
            expect(await store.get(id2)).not.toBeNull()

            await store.deleteAll()
            expect(await store.get(id2)).toBeNull()
        })

        it("count returns current queue length and updates after enqueue/delete", async () => {
            expect(await store.count()).toBe(0)
            let id1 = await store.enqueue({ type: "c1", payload: 1 })
            expect(await store.count()).toBe(1)
            await store.enqueue({ type: "c2", payload: 2 })
            expect(await store.count()).toBe(2)
            await store.delete(id1)
            expect(await store.count()).toBe(1)
            await store.deleteAll()
            expect(await store.count()).toBe(0)
        })

        it("markFailed retains the entry but excludes it from claim and lists it in listFailed", async () => {
            let id = await store.enqueue({ type: "f", payload: {} })
            await store.claim(1000)
            await store.markFailed(id, "fatal 400")

            let entry = await store.get(id)
            expect(entry).not.toBeNull()
            expect(entry!.failedAt).toBe(clock.nowMs)
            expect(entry!.lastError).toBe("fatal 400")
            expect(entry!.reservedTo).toBe(Number.MAX_SAFE_INTEGER)

            expect(await store.claim(1000)).toBeNull()

            let failed = await store.listFailed()
            expect(failed.map((e) => e.id)).toContain(id)
        })

        it("retry clears failed state and resets attempts so the entry is claimable again", async () => {
            let id = await store.enqueue({ type: "r", payload: {} })
            await store.claim(1000)
            await store.markFailed(id, "boom")

            await store.retry(id)

            let entry = await store.get(id)
            expect(entry!.failedAt).toBeUndefined()
            expect(entry!.attempts).toBe(0)
            expect(entry!.reservedTo).toBe(0)
            expect((await store.listFailed()).map((e) => e.id)).not.toContain(id)

            let claimed = await store.claim(1000)
            expect(claimed?.id).toBe(id)
            expect(claimed?.attempts).toBe(1)
        })

        it("releaseUncounted undoes the claim's attempt increment and makes the entry claimable", async () => {
            clock.nowMs = 1000
            let id = await store.enqueue({ type: "u", payload: {} })
            let claimed = await store.claim(30000)
            expect(claimed?.attempts).toBe(1)

            await store.releaseUncounted(id, "offline")

            let entry = await store.get(id)
            expect(entry!.attempts).toBe(0)
            expect(entry!.lastError).toBe("offline")
            expect(entry!.reservedTo).toBe(0)

            expect((await store.claim(1000))?.id).toBe(id)
        })

        it("concurrent claim does not double-book the same entry", async () => {
            await store.enqueue({ type: "a", payload: 1 })
            let [c1, c2] = await Promise.all([store.claim(30000), store.claim(30000)])
            let claimed = [c1, c2].filter((e) => e != null)
            expect(claimed).toHaveLength(1)
            expect(claimed[0]!.attempts).toBe(1)
        })
    })
}
