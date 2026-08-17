import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sleep } from "./sleep"

describe("sleep", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("resolves after specified milliseconds", async () => {
        let resolved = false
        const promise = sleep(100).then(() => {
            resolved = true
        })

        expect(resolved).toBe(false)

        vi.advanceTimersByTime(100)
        await promise

        expect(resolved).toBe(true)
    })

    it("accepts zero delay and resolves immediately", async () => {
        let resolved = false
        sleep(0).then(() => {
            resolved = true
        })

        vi.advanceTimersByTime(0)
        await Promise.resolve()

        expect(resolved).toBe(true)
    })

    it("throws RangeError for negative delay", () => {
        expect(() => sleep(-1)).toThrow(RangeError)
        expect(() => sleep(-1)).toThrow("sleep: ms must be a non-negative number")
    })

    it("supports AbortSignal – aborts before delay", async () => {
        const controller = new AbortController()
        controller.abort()

        await expect(sleep(1000, controller.signal)).rejects.toThrow("This operation was aborted")
    })

    it("supports AbortSignal – aborts during delay", async () => {
        const controller = new AbortController()
        const promise = sleep(500, controller.signal)

        setTimeout(() => controller.abort(), 100)
        vi.advanceTimersByTime(100)

        await expect(promise).rejects.toThrow("This operation was aborted")
    })

    it("cleans up timeout when aborted (no leak)", async () => {
        const controller = new AbortController()
        const promise = sleep(1000, controller.signal)

        controller.abort()
        vi.advanceTimersByTime(1000)

        await expect(promise).rejects.toThrow()
    })

    it("does not reject if signal is aborted after resolution", async () => {
        const controller = new AbortController()
        const promise = sleep(50, controller.signal)

        vi.advanceTimersByTime(50)
        controller.abort()

        await expect(promise).resolves.toBeUndefined()
    })

    it("works without signal (original behavior)", async () => {
        let resolved = false
        sleep(200).then(() => {
            resolved = true
        })

        vi.advanceTimersByTime(200)
        await Promise.resolve()

        expect(resolved).toBe(true)
    })
})
