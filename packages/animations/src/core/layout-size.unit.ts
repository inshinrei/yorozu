import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { flushDomSchedule } from "./dom-schedule"
import { createHeavyAnimationLock } from "./heavy-lock"
import { createLayoutSizeTween } from "./layout-size"

describe("createLayoutSizeTween", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
        )
        vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
    })
    afterEach(() => {
        flushDomSchedule()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("duration 0 writes the target then applyRest without holding the lock", async () => {
        let written: number[] = []
        let rests = 0
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let tween = createLayoutSizeTween({
            readPx: () => 10,
            writePx: (px) => written.push(px),
            applyRest: () => {
                rests += 1
            },
            lock,
        })
        let playback = tween.play(40, 0)
        flushDomSchedule()
        expect(await playback.done).toBe(true)
        expect(written).toEqual([40])
        expect(rests).toBe(1)
        expect(lock.isHeld()).toBe(false)
    })

    it("acquires any-level lock for a timed play and releases on finish", async () => {
        let written: number[] = []
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let tween = createLayoutSizeTween({
            readPx: () => 0,
            writePx: (px) => written.push(px),
            applyRest: () => undefined,
            lock,
        })
        let playback = tween.play(10, 32)
        flushDomSchedule()
        expect(lock.isHeld()).toBe(true)
        expect(lock.level()).toBe("any")
        await vi.advanceTimersByTimeAsync(80)
        flushDomSchedule()
        expect(await playback.done).toBe(true)
        expect(written.at(-1)).toBe(10)
        expect(lock.isHeld()).toBe(false)
    })

    it("cancel and snap call applyRest and drop the lock", async () => {
        let rests = 0
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let tween = createLayoutSizeTween({
            readPx: () => 0,
            writePx: () => undefined,
            applyRest: () => {
                rests += 1
            },
            lock,
        })
        let playback = tween.play(100, 200)
        flushDomSchedule()
        playback.cancel()
        flushDomSchedule()
        expect(await playback.done).toBe(false)
        expect(lock.isHeld()).toBe(false)
        expect(rests).toBeGreaterThanOrEqual(1)
        tween.snap()
        expect(rests).toBeGreaterThanOrEqual(2)
    })
})
