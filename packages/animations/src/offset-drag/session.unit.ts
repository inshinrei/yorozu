// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MOTION_SETTLE_MS } from "../core/motion-timing"
import { createOffsetDrag } from "./session"

function pointer(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
    return new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        ...init,
    })
}

function wheel(init: Partial<WheelEventInit> = {}): WheelEvent {
    return new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 0, deltaY: 0, ...init })
}

describe("createOffsetDrag", () => {
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

    it("live-follows pointer and releases with from pointer; default bounce tweens to 0", async () => {
        let releases: string[] = []
        let drag = createOffsetDrag({
            getEnabled: () => true,
            onRelease: (snap) => {
                releases.push(snap.from)
            },
        })
        expect(drag.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))).toBe(true)
        drag.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        expect(drag.axis()).toBe("horizontal")
        expect(drag.offsetX()).toBe(-80)
        drag.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(releases).toEqual(["pointer"])
        expect(drag.settling()).toBe(true)
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS + 32)
        expect(drag.offsetX()).toBe(0)
        expect(drag.settling()).toBe(false)
        drag.destroy()
    })

    it("applies mapOffset each move", () => {
        let drag = createOffsetDrag({
            getEnabled: () => true,
            mapOffset: ({ x, y, axis }) => (axis === "horizontal" ? { x: x * 0.28, y: 0 } : { x: 0, y }),
        })
        drag.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        drag.onPointerMove(pointer("pointermove", { clientX: 300, clientY: 200 }))
        expect(drag.offsetX()).toBeCloseTo(-28, 5)
        drag.destroy()
    })

    it("pointercancel is from cancel and bounces", async () => {
        let from: string[] = []
        let drag = createOffsetDrag({
            getEnabled: () => true,
            onRelease: (snap) => {
                from.push(snap.from)
            },
        })
        drag.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        drag.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        drag.onPointerCancel(pointer("pointercancel", { clientX: 320, clientY: 200 }))
        expect(from).toEqual(["cancel"])
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS + 32)
        expect(drag.offsetX()).toBe(0)
        drag.destroy()
    })

    it("wheel 120px waits for idle then onRelease from wheel", () => {
        let from: string[] = []
        let drag = createOffsetDrag({
            getEnabled: () => true,
            onRelease: (snap) => {
                from.push(snap.from)
            },
        })
        expect(drag.onWheel(wheel({ deltaX: 120 }))).toBe(true)
        expect(drag.offsetX()).toBe(-120)
        expect(from).toEqual([])
        vi.advanceTimersByTime(90)
        expect(from).toEqual([])
        vi.advanceTimersByTime(50)
        expect(from).toEqual(["wheel"])
        drag.destroy()
    })

    it("zero-delta wheel does not move offset and rearms idle to 140ms", () => {
        let from: string[] = []
        let drag = createOffsetDrag({
            getEnabled: () => true,
            onRelease: (snap) => {
                from.push(snap.from)
            },
        })
        drag.onWheel(wheel({ deltaX: 80 }))
        expect(drag.offsetX()).toBe(-80)
        drag.onWheel(wheel({ deltaX: 0, deltaY: 0 }))
        expect(drag.offsetX()).toBe(-80)
        vi.advanceTimersByTime(90)
        expect(from).toEqual([])
        vi.advanceTimersByTime(50)
        expect(from).toEqual(["wheel"])
        drag.destroy()
    })

    it("sub-quiet 5px wheel ticks accumulate offset", () => {
        let drag = createOffsetDrag({ getEnabled: () => true })
        drag.onWheel(wheel({ deltaX: 5 }))
        expect(drag.offsetX()).toBe(-5)
        drag.onWheel(wheel({ deltaX: 5 }))
        expect(drag.offsetX()).toBe(-10)
        drag.destroy()
    })

    it("momentum wheel after contact does not change offset", () => {
        let from: string[] = []
        let drag = createOffsetDrag({
            getEnabled: () => true,
            onRelease: (snap) => {
                from.push(snap.from)
            },
        })
        drag.onWheel(wheel({ deltaX: 80 }))
        expect(drag.offsetX()).toBe(-80)
        let coast = wheel({ deltaX: 40 })
        Object.defineProperty(coast, "momentum", { value: true })
        expect(drag.onWheel(coast)).toBe(true)
        expect(from).toEqual(["wheel"])
        expect(drag.offsetX()).toBe(-80)
        let more = wheel({ deltaX: 40 })
        Object.defineProperty(more, "momentum", { value: true })
        drag.onWheel(more)
        expect(drag.offsetX()).toBe(-80)
        drag.destroy()
    })

    it("settleTo duration 0 snaps when reduced motion", () => {
        let drag = createOffsetDrag({
            getEnabled: () => true,
            prefersReducedMotion: () => true,
        })
        drag.setOffset(-80, 0)
        drag.settleTo(0, 0, 350)
        expect(drag.offsetX()).toBe(0)
        expect(drag.settling()).toBe(false)
        drag.destroy()
    })

    it("settleTo rest clears axis immediately", async () => {
        let drag = createOffsetDrag({ getEnabled: () => true })
        drag.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        drag.onPointerMove(pointer("pointermove", { clientX: 400, clientY: 120 }))
        expect(drag.axis()).toBe("vertical")
        drag.settleTo(0, 0)
        expect(drag.axis()).toBe("none")
        expect(drag.settling()).toBe(true)
        expect(drag.offsetY()).not.toBe(0)
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS + 32)
        expect(drag.axis()).toBe("none")
        expect(drag.offsetY()).toBe(0)
        drag.destroy()
    })

    it("trapWheel preventDefault when enabled; skips when disabled or modifier", () => {
        let disabled = createOffsetDrag({ getEnabled: () => false })
        let blocked = wheel({ deltaX: 80 })
        let preventBlocked = vi.spyOn(blocked, "preventDefault")
        expect(disabled.trapWheel(blocked)).toBe(false)
        expect(preventBlocked).not.toHaveBeenCalled()
        disabled.destroy()

        let mods = createOffsetDrag({ getEnabled: () => true })
        let ctrl = wheel({ deltaX: 80, ctrlKey: true })
        let preventCtrl = vi.spyOn(ctrl, "preventDefault")
        expect(mods.trapWheel(ctrl)).toBe(false)
        expect(preventCtrl).not.toHaveBeenCalled()
        mods.destroy()

        let ok = createOffsetDrag({ getEnabled: () => true })
        let ev = wheel({ deltaX: 80 })
        let prevent = vi.spyOn(ev, "preventDefault")
        expect(ok.trapWheel(ev)).toBe(true)
        expect(prevent).toHaveBeenCalled()
        ok.destroy()
    })

    it("host settleTo during onRelease suppresses default bounce", () => {
        let drag = createOffsetDrag({
            getEnabled: () => true,
            onRelease: () => {
                drag.settleTo(-40, 0, 0)
            },
        })
        drag.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        drag.onPointerMove(pointer("pointermove", { clientX: 320, clientY: 200 }))
        drag.onPointerUp(pointer("pointerup", { clientX: 320, clientY: 200 }))
        expect(drag.offsetX()).toBe(-40)
        expect(drag.settling()).toBe(false)
        drag.destroy()
    })

    it("trapWheel skips preventDefault on metaKey", () => {
        let drag = createOffsetDrag({ getEnabled: () => true })
        let meta = wheel({ deltaX: 80, metaKey: true })
        let preventMeta = vi.spyOn(meta, "preventDefault")
        expect(drag.trapWheel(meta)).toBe(false)
        expect(preventMeta).not.toHaveBeenCalled()
        drag.destroy()
    })

    it("ignores wheel deltas while a pointer is captured", () => {
        let drag = createOffsetDrag({ getEnabled: () => true })
        drag.onPointerDown(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        drag.onPointerMove(pointer("pointermove", { clientX: 360, clientY: 200 }))
        expect(drag.offsetX()).toBe(-40)
        let ev = wheel({ deltaX: 80 })
        expect(drag.onWheel(ev)).toBe(true)
        expect(drag.offsetX()).toBe(-40)
        drag.destroy()
    })

    it("consumeWheelSession gates leftover wheel until cooldown plus quiet", () => {
        let from: string[] = []
        let drag = createOffsetDrag({
            getEnabled: () => true,
            onRelease: (snap) => {
                from.push(snap.from)
            },
        })
        drag.onWheel(wheel({ deltaX: 80 }))
        drag.consumeWheelSession()
        expect(drag.onWheel(wheel({ deltaX: 80 }))).toBe(true)
        vi.advanceTimersByTime(140)
        expect(from).toEqual([])
        vi.advanceTimersByTime(420)
        drag.onWheel(wheel({ deltaX: 0 }))
        drag.onWheel(wheel({ deltaX: 80 }))
        vi.advanceTimersByTime(140)
        expect(from).toEqual(["wheel"])
        drag.destroy()
    })

    it("consumeWheelSession after destroy is a no-op", () => {
        let drag = createOffsetDrag({ getEnabled: () => true })
        drag.destroy()
        drag.consumeWheelSession()
        expect(drag.onWheel(wheel({ deltaX: 80 }))).toBe(false)
    })

    it("setOffset cancels an in-flight settle tween", async () => {
        let drag = createOffsetDrag({ getEnabled: () => true })
        drag.setOffset(-80, 0)
        drag.settleTo(0, 0, MOTION_SETTLE_MS)
        expect(drag.settling()).toBe(true)
        await vi.advanceTimersByTimeAsync(50)
        let mid = drag.offsetX()
        expect(mid).toBeGreaterThan(-80)
        expect(mid).toBeLessThan(0)
        drag.setOffset(-40, 0)
        expect(drag.settling()).toBe(false)
        expect(drag.offsetX()).toBe(-40)
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS)
        expect(drag.offsetX()).toBe(-40)
        drag.destroy()
    })
})
