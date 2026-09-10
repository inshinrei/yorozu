// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
    MEDIA_SWIPE_EDGE_RESIST,
    MEDIA_SWIPE_WHEEL_COOLDOWN_MS,
    MEDIA_SWIPE_WHEEL_RELEASE_MS,
    MEDIA_SWIPE_X_THRESHOLD,
} from "./swipe"
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
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 200 }))
        // reverse a few px so lastDelta disagrees with total offset
        swipe.onPointerMove(pointer("pointermove", { clientX: 310, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 310, clientY: 200 }))
        expect(onNewer).not.toHaveBeenCalled()
        let bounced = swipe.offsetX()
        expect(bounced).not.toBe(0)
        expect(swipe.settling()).toBe(true)
        vi.advanceTimersByTime(50)
        expect(Math.abs(swipe.offsetX())).toBeLessThan(Math.abs(bounced))
        vi.advanceTimersByTime(400)
        expect(swipe.offsetX()).toBe(0)
        expect(onNewer).not.toHaveBeenCalled()
        swipe.destroy()
    })

    it("commits newer on pointer swipe when prefers reduced motion", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                getPrefersReducedMotion: () => true,
                onNewer,
            }),
        )
        expect(swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))).toBe(true)
        swipe.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
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

    it("trapWheel skips preventDefault when disabled or modifier", () => {
        let disabled = createMediaSwipe(baseCbs({ getEnabled: () => false }))
        let blocked = wheel({ deltaX: 80 })
        let preventBlocked = vi.spyOn(blocked, "preventDefault")
        expect(disabled.trapWheel(blocked)).toBe(false)
        expect(preventBlocked).not.toHaveBeenCalled()
        disabled.destroy()

        let mods = createMediaSwipe(baseCbs())
        let ctrl = wheel({ deltaX: 80, ctrlKey: true })
        let meta = wheel({ deltaX: 80, metaKey: true })
        let preventCtrl = vi.spyOn(ctrl, "preventDefault")
        let preventMeta = vi.spyOn(meta, "preventDefault")
        expect(mods.trapWheel(ctrl)).toBe(false)
        expect(mods.trapWheel(meta)).toBe(false)
        expect(preventCtrl).not.toHaveBeenCalled()
        expect(preventMeta).not.toHaveBeenCalled()
        mods.destroy()
    })

    it("trapWheel preventDefault and early-commits when prefers reduced motion", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                getPrefersReducedMotion: () => true,
                onNewer,
            }),
        )
        let ev = wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1 })
        let prevent = vi.spyOn(ev, "preventDefault")
        expect(swipe.trapWheel(ev)).toBe(true)
        expect(prevent).toHaveBeenCalled()
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("commits once per wheel session until cooldown idle", () => {
        vi.useFakeTimers()
        expect(MEDIA_SWIPE_WHEEL_COOLDOWN_MS).toBe(420)
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        let early = MEDIA_SWIPE_X_THRESHOLD * 2 + 1
        expect(swipe.onWheel(wheel({ deltaX: early, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        let leftover = wheel({ deltaX: early, deltaY: 0 })
        let preventLeftover = vi.spyOn(leftover, "preventDefault")
        expect(swipe.onWheel(leftover)).toBe(true)
        expect(swipe.onWheel(wheel({ deltaX: early, deltaY: 0 }))).toBe(true)
        expect(preventLeftover).toHaveBeenCalled()
        expect(onNewer).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(swipe.onWheel(wheel({ deltaX: early, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_COOLDOWN_MS)
        expect(swipe.onWheel(wheel({ deltaX: early, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(2)
        swipe.destroy()
    })

    it("wheel bounce ignores leftover wheel until idle", () => {
        vi.useFakeTimers()
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onWheel(wheel({ deltaX: 80, deltaY: 0 }))).toBe(true)
        expect(swipe.onWheel(wheel({ deltaX: -20, deltaY: 0 }))).toBe(true)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).not.toHaveBeenCalled()
        let leftover = wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1, deltaY: 0 })
        let preventLeftover = vi.spyOn(leftover, "preventDefault")
        expect(swipe.onWheel(leftover)).toBe(true)
        expect(preventLeftover).toHaveBeenCalled()
        expect(swipe.onWheel(wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(0)
        expect(swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))).toBe(true)
        swipe.destroy()
    })

    it("no-op pointer after wheel bounce keeps holdoff until idle", () => {
        vi.useFakeTimers()
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onWheel(wheel({ deltaX: 80, deltaY: 0 }))).toBe(true)
        expect(swipe.onWheel(wheel({ deltaX: -20, deltaY: 0 }))).toBe(true)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).not.toHaveBeenCalled()
        expect(swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))).toBe(true)
        swipe.onPointerCancel(pointer("pointercancel", { clientX: 400, clientY: 200 }))
        let leftover = wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1, deltaY: 0 })
        expect(swipe.onWheel(leftover)).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(0)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(swipe.onWheel(wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(0)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_COOLDOWN_MS)
        expect(swipe.onWheel(wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("does not commit leftover wheel after pointer nav before idle", () => {
        vi.useFakeTimers()
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
        let leftover = wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1, deltaY: 0 })
        let preventLeftover = vi.spyOn(leftover, "preventDefault")
        expect(swipe.onWheel(leftover)).toBe(true)
        expect(preventLeftover).toHaveBeenCalled()
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("trapWheel preventDefault then onWheel when enabled", () => {
        let order: string[] = []
        let onNewer = vi.fn(() => {
            order.push("newer")
        })
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        let ev = wheel({ deltaX: MEDIA_SWIPE_X_THRESHOLD * 2 + 1 })
        let origPrevent = ev.preventDefault.bind(ev)
        ev.preventDefault = (): void => {
            order.push("prevent")
            origPrevent()
        }
        expect(swipe.trapWheel(ev)).toBe(true)
        expect(order[0]).toBe("prevent")
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("vertical pointer drag past threshold closes", () => {
        let onClose = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onClose }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 280 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 400, clientY: 280 }))
        expect(onClose).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("wheel idle 90ms commits; destroy clears the wheel timer", () => {
        vi.useFakeTimers()
        expect(MEDIA_SWIPE_WHEEL_RELEASE_MS).toBe(90)
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onWheel(wheel({ deltaX: 60, deltaY: 0 }))).toBe(true)
        expect(onNewer).not.toHaveBeenCalled()
        vi.advanceTimersByTime(90)
        expect(onNewer).toHaveBeenCalledTimes(1)

        let late = vi.fn()
        let doomed = createMediaSwipe(baseCbs({ onNewer: late }))
        expect(doomed.onWheel(wheel({ deltaX: 60, deltaY: 0 }))).toBe(true)
        doomed.destroy()
        vi.advanceTimersByTime(90)
        expect(late).not.toHaveBeenCalled()
        swipe.destroy()
    })
})
