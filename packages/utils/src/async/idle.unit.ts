import { afterEach, describe, expect, it, vi } from "vitest"
import { requestIdle } from "./idle"

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

    it("uses requestIdleCallback when present and cancelIdleCallback on cancel", () => {
        let ric = vi.fn((_cb: (d: { didTimeout: boolean; timeRemaining(): number }) => void) => 7)
        let cancel = vi.fn()
        vi.stubGlobal("requestIdleCallback", ric)
        vi.stubGlobal("cancelIdleCallback", cancel)
        let h = requestIdle(() => {}, { timeout: 50 })
        expect(ric).toHaveBeenCalledTimes(1)
        expect(ric.mock.calls[0]?.[1]).toEqual({ timeout: 50 })
        h.cancel()
        expect(cancel).toHaveBeenCalledWith(7)
    })

    it("omits ric options when timeout is not passed", () => {
        let ric = vi.fn(() => 1)
        vi.stubGlobal("requestIdleCallback", ric)
        vi.stubGlobal("cancelIdleCallback", vi.fn())
        requestIdle(() => {})
        expect(ric.mock.calls[0]?.[1]).toBeUndefined()
    })
})
