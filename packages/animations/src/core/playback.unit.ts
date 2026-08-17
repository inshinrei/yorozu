import { describe, expect, it, vi } from "vitest"
import { animateElement, createPlayback } from "./playback"

describe("createPlayback", () => {
    it("resolves false on cancel", async () => {
        let { playback, resolve } = createPlayback()
        playback.cancel()
        expect(await playback.done).toBe(false)
        resolve(true)
        expect(await playback.done).toBe(false)
    })

    it("resolves true when finished", async () => {
        let { playback, resolve } = createPlayback()
        resolve(true)
        expect(await playback.done).toBe(true)
    })
})

describe("animateElement", () => {
    it("returns null when animate is missing", () => {
        expect(animateElement({} as Element, [{ opacity: 0 }, { opacity: 1 }], { duration: 1 })).toBeNull()
    })

    it("calls element.animate with the given keyframes", () => {
        let animate = vi.fn(() => ({ finished: Promise.resolve() }))
        let el = { animate } as unknown as Element
        animateElement(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "ease-out" })
        expect(animate).toHaveBeenCalledOnce()
    })
})
