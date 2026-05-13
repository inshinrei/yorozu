import { beforeEach, describe, expect, it } from "vitest"
import { ConditionVariable } from "./condition-variable"

describe("ConditionVariable", () => {
    let cv: ConditionVariable

    beforeEach(() => {
        cv = new ConditionVariable()
    })

    it("wait() returns a pending Promise", () => {
        let p = cv.wait()
        expect(p).toBeInstanceOf(Promise)
    })

    it("multiple concurrent wait() calls return different promises", () => {
        let p1 = cv.wait()
        let p2 = cv.wait()
        let p3 = cv.wait()

        expect(p1).not.toBe(p2)
        expect(p2).not.toBe(p3)
    })

    it("notify() resolves ALL pending waiters (broadcast)", async () => {
        let p1 = cv.wait()
        let p2 = cv.wait()
        let p3 = cv.wait()

        let resolved1 = false
        let resolved2 = false
        let resolved3 = false

        p1.then(() => {
            resolved1 = true
        })
        p2.then(() => {
            resolved2 = true
        })
        p3.then(() => {
            resolved3 = true
        })

        cv.notify()

        await Promise.all([p1, p2, p3])

        expect(resolved1).toBe(true)
        expect(resolved2).toBe(true)
        expect(resolved3).toBe(true)
    })

    it("notify() is a no-op when no one is waiting", () => {
        expect(() => cv.notify()).not.toThrow()
    })

    it("after notify() a new wait() starts a fresh cycle", async () => {
        let first = cv.wait()
        cv.notify()
        await first

        let second = cv.wait()
        let resolved = false
        second.then(() => {
            resolved = true
        })

        cv.notify()
        await second

        expect(resolved).toBe(true)
    })

    it("notify() is idempotent after broadcast", async () => {
        let p = cv.wait()
        let resolvedCount = 0
        p.then(() => {
            resolvedCount++
        })

        cv.notify()
        cv.notify()
        cv.notify()

        await p
        expect(resolvedCount).toBe(1)
    })

    it("notify() before any wait() is harmless and next wait() still works", async () => {
        cv.notify()

        let p = cv.wait()
        let resolved = false
        p.then(() => {
            resolved = true
        })

        cv.notify()
        await p

        expect(resolved).toBe(true)
    })
})
