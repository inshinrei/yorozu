// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    MEDIA_SWIPE_EDGE_RESIST,
    MEDIA_SWIPE_SETTLE_MS,
    MEDIA_SWIPE_WHEEL_COOLDOWN_MS,
    MEDIA_SWIPE_WHEEL_QUIET_PX,
    MEDIA_SWIPE_WHEEL_RELEASE_MS,
} from "./swipe"
import { createMediaSwipe, type MediaSwipe } from "./swipe-controller"

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

function playWheel(swipe: MediaSwipe, steps: { dt: number; deltaX: number; deltaY?: number }[]): void {
    for (let step of steps) {
        if (step.dt > 0) vi.advanceTimersByTime(step.dt)
        swipe.onWheel(wheel({ deltaX: step.deltaX, deltaY: step.deltaY ?? 0 }))
    }
}

describe("createMediaSwipe", () => {
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

    it("commits newer on left pointer drag past threshold then settles to 0", async () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))).toBe(true)
        swipe.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(MEDIA_SWIPE_SETTLE_MS + 48)
        expect(swipe.offsetX()).toBe(0)
        swipe.destroy()
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

    it("bounces on reverse-cancel after past-threshold drag", async () => {
        let onNewer = vi.fn()
        let onSettle = vi.fn()
        let onGestureChange = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer, onSettle, onGestureChange }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        expect(onGestureChange).toHaveBeenCalledWith(true)
        swipe.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 310, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 310, clientY: 200 }))
        expect(onNewer).not.toHaveBeenCalled()
        let bounced = swipe.offsetX()
        expect(bounced).not.toBe(0)
        expect(swipe.settling()).toBe(true)
        expect(onSettle).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(50)
        expect(Math.abs(swipe.offsetX())).toBeLessThan(Math.abs(bounced))
        await vi.advanceTimersByTimeAsync(400)
        expect(swipe.offsetX()).toBe(0)
        expect(onNewer).not.toHaveBeenCalled()
        expect(onSettle).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("does not fire onSettle when a new pointerdown interrupts bounce", async () => {
        let onSettle = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onSettle }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 380, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 380, clientY: 200 }))
        expect(swipe.settling()).toBe(true)
        expect(onSettle).not.toHaveBeenCalled()
        expect(swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200, pointerId: 2 }))).toBe(true)
        expect(onSettle).not.toHaveBeenCalled()
        swipe.destroy()
    })

    it("commits newer on reduced-motion pointer swipe and snaps after the rebase hop", async () => {
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
        await vi.advanceTimersByTimeAsync(16)
        expect(swipe.offsetX()).toBe(0)
        swipe.destroy()
    })

    it("still calls onNewer when willRebaseNav is false", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                onNewer,
                willRebaseNav: () => false,
            }),
        )
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 300, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
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

    it.each([false, true])("trapWheel preventDefault then idle-commits after 90ms (reduced=%s)", (reduced: boolean) => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(
            baseCbs({
                getPrefersReducedMotion: () => reduced,
                onNewer,
            }),
        )
        let ev = wheel({ deltaX: 80 })
        let prevent = vi.spyOn(ev, "preventDefault")
        expect(swipe.trapWheel(ev)).toBe(true)
        expect(prevent).toHaveBeenCalled()
        expect(onNewer).not.toHaveBeenCalled()
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("commits once per wheel session until cooldown plus a quiet sample", () => {
        expect(MEDIA_SWIPE_WHEEL_COOLDOWN_MS).toBe(420)
        expect(MEDIA_SWIPE_WHEEL_QUIET_PX).toBe(10)
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onWheel(wheel({ deltaX: 80, deltaY: 0 }))).toBe(true)
        expect(onNewer).not.toHaveBeenCalled()
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).toHaveBeenCalledTimes(1)
        let leftover = wheel({ deltaX: 80, deltaY: 0 })
        let preventLeftover = vi.spyOn(leftover, "preventDefault")
        expect(swipe.onWheel(leftover)).toBe(true)
        expect(preventLeftover).toHaveBeenCalled()
        expect(onNewer).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_COOLDOWN_MS)
        expect(swipe.onWheel(wheel({ deltaX: 0, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        expect(swipe.onWheel(wheel({ deltaX: 80, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).toHaveBeenCalledTimes(2)
        swipe.destroy()
    })

    it("leftover wheel during cooldown does not restart the cooldown", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        let tick = 80
        expect(swipe.onWheel(wheel({ deltaX: tick, deltaY: 0 }))).toBe(true)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).toHaveBeenCalledTimes(1)
        for (let i = 0; i < 8; i++) {
            vi.advanceTimersByTime(50)
            expect(swipe.onWheel(wheel({ deltaX: tick, deltaY: 0 }))).toBe(true)
        }
        expect(onNewer).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_COOLDOWN_MS - 400)
        expect(swipe.onWheel(wheel({ deltaX: tick, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        expect(swipe.onWheel(wheel({ deltaX: 0, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        expect(swipe.onWheel(wheel({ deltaX: tick, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).toHaveBeenCalledTimes(2)
        swipe.destroy()
    })

    it("wheel 20px plus 90ms does not navigate", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onWheel(wheel({ deltaX: 20, deltaY: 0 }))).toBe(true)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).not.toHaveBeenCalled()
        swipe.destroy()
    })

    it("wheel 120px waits for quiet idle (no early commit)", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onWheel(wheel({ deltaX: 120, deltaY: 0 }))).toBe(true)
        expect(onNewer).not.toHaveBeenCalled()
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("wheel deltaY 80 (up) plus 90ms does not close", () => {
        let onClose = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onClose }))
        expect(swipe.onWheel(wheel({ deltaX: 0, deltaY: 80 }))).toBe(true)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onClose).not.toHaveBeenCalled()
        swipe.destroy()
    })

    it("wheel deltaY -80 (down) plus 90ms closes once", () => {
        let onClose = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onClose }))
        expect(swipe.onWheel(wheel({ deltaX: 0, deltaY: -80 }))).toBe(true)
        expect(onClose).not.toHaveBeenCalled()
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onClose).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("pointer swipe down 80px closes once", () => {
        let onClose = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onClose }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 280 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 400, clientY: 280 }))
        expect(onClose).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("pointer swipe up 80px does not close and settles to 0", async () => {
        let onClose = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onClose }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 120 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 400, clientY: 120 }))
        expect(onClose).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(400)
        expect(swipe.offsetY()).toBe(0)
        swipe.destroy()
    })

    it("clears axis to none when bounce-settling after upward swipe", async () => {
        let onClose = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onClose }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 120 }))
        expect(swipe.axis()).toBe("vertical")
        swipe.onPointerUp(pointer("pointerup", { clientX: 400, clientY: 120 }))
        expect(onClose).not.toHaveBeenCalled()
        expect(swipe.axis()).toBe("none")
        await vi.advanceTimersByTimeAsync(400)
        expect(swipe.axis()).toBe("none")
        expect(swipe.offsetY()).toBe(0)
        swipe.destroy()
    })

    it("clears axis to none when bounce-settling a short vertical down", async () => {
        let onClose = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onClose }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 220 }))
        expect(swipe.axis()).toBe("vertical")
        swipe.onPointerUp(pointer("pointerup", { clientX: 400, clientY: 220 }))
        expect(onClose).not.toHaveBeenCalled()
        expect(swipe.axis()).toBe("none")
        await vi.advanceTimersByTimeAsync(400)
        expect(swipe.axis()).toBe("none")
        expect(swipe.offsetY()).toBe(0)
        swipe.destroy()
    })

    it("rejected pointerdown during nav hop does not cancel the hop", async () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
        expect(swipe.settling()).toBe(true)
        let hopped = swipe.offsetX()
        expect(hopped).not.toBe(0)
        expect(swipe.onPointerDown(pointer("pointerdown", { button: 1, clientX: 400, clientY: 200 }))).toBe(false)
        expect(swipe.offsetX()).toBe(hopped)
        expect(swipe.settling()).toBe(true)
        await vi.advanceTimersByTimeAsync(MEDIA_SWIPE_SETTLE_MS + 48)
        expect(swipe.offsetX()).toBe(0)
        swipe.destroy()
    })

    it("does not commit leftover wheel after pointer nav before idle", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        swipe.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(onNewer).toHaveBeenCalledTimes(1)
        let leftover = wheel({ deltaX: 120, deltaY: 0 })
        let preventLeftover = vi.spyOn(leftover, "preventDefault")
        expect(swipe.onWheel(leftover)).toBe(true)
        expect(preventLeftover).toHaveBeenCalled()
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("wheel idle 90ms commits; destroy clears the wheel timer", () => {
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

    it("wheel bounce ignores leftover wheel until idle", () => {
        let onNewer = vi.fn()
        let swipe = createMediaSwipe(baseCbs({ onNewer }))
        expect(swipe.onWheel(wheel({ deltaX: 80, deltaY: 0 }))).toBe(true)
        expect(swipe.onWheel(wheel({ deltaX: -20, deltaY: 0 }))).toBe(true)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).not.toHaveBeenCalled()
        playWheel(
            swipe,
            Array.from({ length: 10 }, () => ({ dt: 50, deltaX: 120 })),
        )
        expect(onNewer).toHaveBeenCalledTimes(0)
        expect(swipe.onWheel(wheel({ deltaX: 0, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(0)
        expect(swipe.onWheel(wheel({ deltaX: 120, deltaY: 0 }))).toBe(true)
        expect(onNewer).toHaveBeenCalledTimes(0)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        expect(onNewer).toHaveBeenCalledTimes(1)
        swipe.destroy()
    })

    it("dismissOpacity stays 1 while offsetY is negative", () => {
        let swipe = createMediaSwipe(baseCbs())
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 120 }))
        expect(swipe.offsetY()).toBe(-80)
        expect(swipe.dismissOpacity()).toBe(1)
        swipe.reset()
        swipe.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        swipe.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 280 }))
        expect(swipe.offsetY()).toBe(80)
        expect(swipe.dismissOpacity()).toBeLessThan(1)
        swipe.destroy()
    })
})
