import { beforeEach, describe, expect, it, vi } from "vitest"
import { AsyncLock } from "./async-lock"

describe("AsyncLock", () => {
    let lock: AsyncLock

    beforeEach(() => {
        lock = new AsyncLock()
    })

    it("starts unlocked", async () => {
        await expect(lock.acquire()).resolves.toBeUndefined()
        lock.release()
    })

    it.todo("acquire() is sequential when called multiple times", async () => {
        const order: number[] = []

        const p1 = lock.acquire().then(() => order.push(1))
        const p2 = lock.acquire().then(() => order.push(2))
        const p3 = lock.acquire().then(() => order.push(3))

        await Promise.resolve()
        expect(order).toEqual([1])

        lock.release()
        await Promise.resolve()
        expect(order).toEqual([1, 2])

        lock.release()
        await Promise.resolve()
        expect(order).toEqual([1, 2, 3])

        lock.release()
        await Promise.all([p1, p2, p3])
    })

    it("release() throws when queue is empty", () => {
        expect(() => lock.release()).toThrow("Nothing to release")
    })

    it("with() acquires, runs the function, and releases", async () => {
        const fn = vi.fn(async () => "result")
        const result = await lock.with(fn)

        expect(fn).toHaveBeenCalledTimes(1)
        expect(result).toBe("result")
        expect(lock["_queue"].length).toBe(0)
    })

    it("with() releases even if the function throws", async () => {
        const fn = vi.fn(async () => {
            throw new Error("boom")
        })

        await expect(lock.with(fn)).rejects.toThrow("boom")

        expect(lock["_queue"].length).toBe(0)
    })

    it("multiple concurrent with() calls are serialized", async () => {
        const results: string[] = []

        const p1 = lock.with(async () => {
            await new Promise((r) => setTimeout(r, 10))
            results.push("first")
            return "first"
        })

        const p2 = lock.with(async () => {
            results.push("second")
            return "second"
        })

        await Promise.all([p1, p2])

        expect(results).toEqual(["first", "second"])
    })
})
