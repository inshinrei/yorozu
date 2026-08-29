import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { playScrollTween } from "./scroll"

describe("playScrollTween", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
        )
        vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("assigns immediately when duration is 0", async () => {
        let el = { scrollLeft: 10, scrollTop: 20 }
        let playback = playScrollTween(el as unknown as HTMLElement, { left: 80, top: 40, durationMs: 0 })
        expect(el.scrollLeft).toBe(80)
        expect(el.scrollTop).toBe(40)
        expect(await playback.done).toBe(true)
    })

    it("leaves the omitted axis unchanged", async () => {
        let el = { scrollLeft: 10, scrollTop: 20 }
        await playScrollTween(el as unknown as HTMLElement, { left: 50, durationMs: 0 }).done
        expect(el.scrollLeft).toBe(50)
        expect(el.scrollTop).toBe(20)
        await playScrollTween(el as unknown as HTMLElement, { top: 90, durationMs: 0 }).done
        expect(el.scrollLeft).toBe(50)
        expect(el.scrollTop).toBe(90)
    })

    it("interpolates scrollLeft via tween when duration is positive", async () => {
        let el = { scrollLeft: 0, scrollTop: 0 }
        let playback = playScrollTween(el as unknown as HTMLElement, { left: 100, durationMs: 200 })
        expect(el.scrollLeft).toBe(0)
        await vi.advanceTimersByTimeAsync(250)
        expect(el.scrollLeft).toBe(100)
        expect(await playback.done).toBe(true)
    })

    it("a second playScrollTween on the same element cancels the first", async () => {
        let el = { scrollLeft: 0, scrollTop: 0 }
        let a = playScrollTween(el as unknown as HTMLElement, { left: 100, durationMs: 200 })
        await vi.advanceTimersByTimeAsync(50)
        let b = playScrollTween(el as unknown as HTMLElement, { left: 0, durationMs: 200 })
        expect(await a.done).toBe(false)
        await vi.advanceTimersByTimeAsync(250)
        expect(el.scrollLeft).toBe(0)
        expect(await b.done).toBe(true)
    })
})
