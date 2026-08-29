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

    it("acquire() is sequential when called multiple times", async () => {
        let order: number[] = []

        let p1 = lock.acquire().then(() => order.push(1))
        let p2 = lock.acquire().then(() => order.push(2))
        let p3 = lock.acquire().then(() => order.push(3))

        await p1
        expect(order).toEqual([1])

        lock.release()
        await p2
        expect(order).toEqual([1, 2])

        lock.release()
        await p3
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

    it("serializes many concurrent with() calls (max in-section is 1)", async () => {
        let concurrent = 0
        let max = 0
        await Promise.all(
            Array.from({length: 200}, () =>
                lock.with(async () => {
                    concurrent++
                    max = Math.max(max, concurrent)
                    await Promise.resolve()
                    concurrent--
                }),
            ),
        )
        expect(max).toBe(1)
    })

    it("contending with() scales near-linear, not quadratic", async () => {
        let timeN = async (n: number): Promise<number> => {
            let l = new AsyncLock()
            let t0 = performance.now()
            await Promise.all(Array.from({length: n}, () => l.with(async () => {})))
            return performance.now() - t0
        }
        let t2 = await timeN(2000)
        let t8 = await timeN(8000)
        // Quadratic wakeups: 4× N → ~16× time (measured ~121ms @2k, ~1.9s @8k).
        // Predecessor chain: ~4× time. Ratio < 8 separates the two.
        expect(t8 / Math.max(t2, 0.1)).toBeLessThan(8)
    })
})
