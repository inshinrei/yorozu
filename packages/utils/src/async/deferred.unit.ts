import { describe, expect, it, vi } from "vitest"
import { Deferred, DeferredTracked } from "./deferred"

describe("Deferred", () => {
    it("creates a pending promise with resolve and reject functions", () => {
        let d = new Deferred<number>()

        expect(d.promise).toBeInstanceOf(Promise)
        expect(typeof d.resolve).toBe("function")
        expect(typeof d.reject).toBe("function")
    })

    it("resolves the promise when resolve is called", async () => {
        let d = new Deferred<string>()
        let spy = vi.fn()

        d.promise.then(spy)
        d.resolve("hello")

        await expect(d.promise).resolves.toBe("hello")
        expect(spy).toHaveBeenCalledWith("hello")
    })

    it("rejects the promise when reject is called", async () => {
        let d = new Deferred<number>()
        let err = new Error("boom")

        let spy = vi.fn()
        d.promise.catch(spy)

        d.reject(err)

        await expect(d.promise).rejects.toThrow("boom")
        expect(spy).toHaveBeenCalledWith(err)
    })

    it("works with generic types and void", async () => {
        let d1 = new Deferred<void>()
        d1.resolve()
        await expect(d1.promise).resolves.toBeUndefined()

        let d2 = new Deferred<{ id: number }>()
        d2.resolve({ id: 42 })
        await expect(d2.promise).resolves.toEqual({ id: 42 })
    })

    it("resolve and reject are stable references", () => {
        let d = new Deferred()
        let resolve1 = d.resolve
        let reject1 = d.reject

        expect(d.resolve).toBe(resolve1)
        expect(d.reject).toBe(reject1)
    })
})

describe("DeferredTracked", () => {
    it("starts in pending state", () => {
        let d = new DeferredTracked<number>()

        expect(d.status).toEqual({ type: "pending" })
        expect(d.result).toBeUndefined()
        expect(d.error).toBeUndefined()
    })

    it("resolve updates status and result", async () => {
        let d = new DeferredTracked<string>()

        d.resolve("success")

        expect(d.status).toEqual({ type: "fulfilled", value: "success" })
        expect(d.result).toBe("success")
        expect(d.error).toBeUndefined()

        await expect(d.promise).resolves.toBe("success")
    })

    it("reject updates status and error", async () => {
        let d = new DeferredTracked<number>()
        let err = new Error("failed")

        d.reject(err)

        expect(d.status).toEqual({ type: "rejected", reason: err })
        expect(d.result).toBeUndefined()
        expect(d.error).toBe(err)

        await expect(d.promise).rejects.toThrow("failed")
    })

    it("resolve and reject are idempotent (no-op after first call)", async () => {
        let d = new DeferredTracked<number>()

        d.resolve(42)
        d.resolve(99)
        d.reject(new Error("ignored"))

        expect(d.status).toEqual({ type: "fulfilled", value: 42 })
        await expect(d.promise).resolves.toBe(42)
    })

    it("works with void", async () => {
        let d = new DeferredTracked<void>()

        d.resolve()

        expect(d.status.type).toBe("fulfilled")
        expect(d.result).toBeUndefined()
        await expect(d.promise).resolves.toBeUndefined()
    })
})
