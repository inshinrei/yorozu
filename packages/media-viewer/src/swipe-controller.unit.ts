// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { MEDIA_SWIPE_EDGE_RESIST, MEDIA_SWIPE_X_THRESHOLD } from "./swipe"
import { createMediaSwipe } from "./swipe-controller"

function pointer(type: string, init: Partial<PointerEventInit>): PointerEvent {
    return new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: 0, clientY: 0, ...init })
}

function wheel(init: Partial<WheelEventInit>): WheelEvent {
    return new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 0, deltaY: 0, ...init })
}

function baseCbs(overrides: Partial<Parameters<typeof createMediaSwipe>[0]> = {}) {
    return {
        getEnabled: () => true,
        getCanOlder: () => true,
        getCanNewer: () => true,
        getPrefersReducedMotion: () => false,
        getViewport: () => ({ width: 1000, height: 800 }),
        onOlder: () => {},
        onNewer: () => {},
        onClose: () => {},
        ...overrides,
    }
}

describe("createMediaSwipe", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it("commits newer on left drag past threshold when canNewer", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        let root = document.createElement("div")
        expect(swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))).toBe(true)
        swipe.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
        root.remove()
    })

    it("swipes to newer even when peek src is missing (loading neighbor)", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                getCanOlder: () => false,
                getCanNewer: () => true,
                onNewer,
            }),
        )
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 204 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 300, clientY: 204 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("bounces on reverse-cancel after past-threshold drag", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 200 }))
        // reverse a few px so lastDelta disagrees with total offset
        swipe.onPointerMove(pointer("pointermove", { clientX: 310, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 310, clientY: 200 }))
        expect(onNewer).not.toHaveBeenCalled()
        expect(swipe.settling() || swipe.offsetX() !== 0 || swipe.offsetY() !== 0 || swipe.axis() === "none").toBe(true)
        swipe.destroy()
    })

    it("ignores pointer when prefers reduced motion", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                getPrefersReducedMotion: () => true,
                onNewer,
            }),
        )
        expect(swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))).toBe(false)
        expect(onNewer).not.toHaveBeenCalled()
        swipe.destroy()
    })

    it("early-commits wheel past 2× threshold", () => {
        vi.useFakeTimers()
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        let early = MEDIA_SWIPE_X_THRESHOLD * 2 + 1
        expect(swipe.onWheel(wheel({ deltaX: early, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("bounces without rebase when willRebaseNav is false", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                onNewer,
                willRebaseNav: () => false,
            }),
        )
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 200 }))
        let dragged = swipe.offsetX()
        expect(dragged).toBeLessThan(0)
        swipe.onPointerUp(pointer("pointerup", { clientX: 300, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
        expect(Math.abs(swipe.offsetX())).toBeLessThan(200)
        expect(swipe.offsetX()).toBeLessThanOrEqual(0)
        swipe.destroy()
    })

    it("resists and bounces when canNewer is false", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                getCanNewer: () => false,
                onNewer,
            }),
        )
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 200 }))
        let raw = -100
        let resisted = raw * MEDIA_SWIPE_EDGE_RESIST
        expect(swipe.offsetX()).toBeCloseTo(resisted, 5)
        swipe.onPointerUp(pointer("pointerup", { clientX: 300, clientY: 200 }))
        expect(onNewer).not.toHaveBeenCalled()
        swipe.destroy()
    })
})
