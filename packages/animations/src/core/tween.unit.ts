import { describe, expect, it, vi } from "vitest"
import { easeOutCubic, lerp, tween } from "./tween"

describe("easeOutCubic", () => {
    it("starts at 0 and ends at 1", () => {
        expect(easeOutCubic(0)).toBe(0)
        expect(easeOutCubic(1)).toBe(1)
        expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    })
})

describe("lerp", () => {
    it("interpolates from → to by t", () => {
        expect(lerp(0, 10, 0)).toBe(0)
        expect(lerp(0, 10, 1)).toBe(10)
        expect(lerp(0, 10, 0.5)).toBe(5)
        expect(lerp(4, 8, 0.25)).toBe(5)
    })
})

describe("tween", () => {
    it("snaps to the end when duration is 0", async () => {
        let values: number[] = []
        let playback = tween({
            from: 0,
            to: 10,
            durationMs: 0,
            onUpdate: (value) => values.push(value),
        })
        expect(values).toEqual([10])
        expect(await playback.done).toBe(true)
    })

    it("resolves false when cancelled mid-run", async () => {
        vi.useFakeTimers()
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
        )
        vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))

        let last = 0
        let playback = tween({
            from: 0,
            to: 100,
            durationMs: 200,
            onUpdate: (value) => {
                last = value
            },
        })
        await vi.advanceTimersByTimeAsync(50)
        playback.cancel()
        expect(await playback.done).toBe(false)
        expect(last).toBeLessThan(100)

        vi.useRealTimers()
        vi.unstubAllGlobals()
    })
})
