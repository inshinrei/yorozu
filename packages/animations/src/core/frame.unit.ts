import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { onAnimationFrame } from "./frame"

describe("onAnimationFrame", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        // delay 1ms so advanceTimersByTimeAsync(1) drains one frame only;
        // setTimeout(0) nests would both flush under a single advance(1)
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(16), 1) as unknown as number,
        )
        vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("runs every subscriber on one rAF and stops when empty", async () => {
        let a = 0
        let b = 0
        let stopA = onAnimationFrame(() => {
            a += 1
        })
        let stopB = onAnimationFrame(() => {
            b += 1
        })
        await vi.advanceTimersByTimeAsync(1)
        expect(a).toBe(1)
        expect(b).toBe(1)
        stopA()
        await vi.advanceTimersByTimeAsync(1)
        expect(a).toBe(1)
        expect(b).toBe(2)
        stopB()
        await vi.advanceTimersByTimeAsync(5)
        expect(b).toBe(2)
    })

    it("unsubscribe is idempotent and safe during a tick", async () => {
        let n = 0
        let stop = onAnimationFrame(() => {
            n += 1
            stop()
            stop()
        })
        await vi.advanceTimersByTimeAsync(1)
        expect(n).toBe(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(n).toBe(1)
    })
})
