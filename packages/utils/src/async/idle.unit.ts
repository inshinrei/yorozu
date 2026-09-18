import { afterEach, describe, expect, it, vi } from "vitest"
import { requestIdle, type IdleDeadline } from "./idle"

type Ric = (fn: (deadline: IdleDeadline) => void, opts?: { timeout?: number }) => number

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe("requestIdle", () => {
    it("falls back to setTimeout 0 when requestIdleCallback is missing", async () => {
        vi.useFakeTimers()
        vi.stubGlobal("requestIdleCallback", undefined)
        vi.stubGlobal("cancelIdleCallback", undefined)
        let calls: Array<{ didTimeout: boolean; remaining: number }> = []
        requestIdle((d) => {
            calls.push({ didTimeout: d.didTimeout, remaining: d.timeRemaining() })
        })
        expect(calls).toEqual([])
        await vi.advanceTimersByTimeAsync(0)
        expect(calls).toEqual([{ didTimeout: true, remaining: 0 }])
    })

    it("cancel prevents the fallback callback", async () => {
        vi.useFakeTimers()
        vi.stubGlobal("requestIdleCallback", undefined)
        let ran = false
        let h = requestIdle(() => {
            ran = true
        })
        h.cancel()
        await vi.advanceTimersByTimeAsync(0)
        expect(ran).toBe(false)
    })

    it("fallback waits opts.timeout when requestIdleCallback is missing", async () => {
        vi.useFakeTimers()
        vi.stubGlobal("requestIdleCallback", undefined)
        vi.stubGlobal("cancelIdleCallback", undefined)
        let ran = false
        requestIdle(
            () => {
                ran = true
            },
            { timeout: 50 },
        )
        await vi.advanceTimersByTimeAsync(49)
        expect(ran).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        expect(ran).toBe(true)
    })

    it("uses requestIdleCallback when present and cancelIdleCallback on cancel", () => {
        let ric = vi.fn<Ric>((_cb) => 7)
        let cancel = vi.fn()
        vi.stubGlobal("requestIdleCallback", ric)
        vi.stubGlobal("cancelIdleCallback", cancel)
        let fn = (): void => {}
        let h = requestIdle(fn, { timeout: 50 })
        expect(ric).toHaveBeenCalledTimes(1)
        expect(ric.mock.calls[0]?.[0]).toBe(fn)
        expect(ric.mock.calls[0]?.[1]).toEqual({ timeout: 50 })
        h.cancel()
        expect(cancel).toHaveBeenCalledWith(7)
    })

    it("forwards timeout 0 to ric as 1 so the deadline is positive", () => {
        let ric = vi.fn<Ric>(() => 1)
        vi.stubGlobal("requestIdleCallback", ric)
        vi.stubGlobal("cancelIdleCallback", vi.fn())
        requestIdle(() => {}, { timeout: 0 })
        expect(ric.mock.calls[0]?.[1]).toEqual({ timeout: 1 })
    })

    it("omits ric options when timeout is not passed", () => {
        let ric = vi.fn<Ric>(() => 1)
        vi.stubGlobal("requestIdleCallback", ric)
        vi.stubGlobal("cancelIdleCallback", vi.fn())
        requestIdle(() => {})
        expect(ric.mock.calls[0]?.[1]).toBeUndefined()
    })
})
