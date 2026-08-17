import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dualRaf } from "./raf"

describe("dualRaf", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
        )
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("resolves after two animation frames", async () => {
        let done = false
        let p = dualRaf().then(() => {
            done = true
        })
        expect(done).toBe(false)
        await vi.runAllTimersAsync()
        await p
        expect(done).toBe(true)
    })
})
