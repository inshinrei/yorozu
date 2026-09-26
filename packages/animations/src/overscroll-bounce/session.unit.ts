// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MOTION_SETTLE_MS } from "../core/motion-timing"
import { WHEEL_RELEASE_MS } from "../offset-drag/wheel-session"
import { rubberBandOverscroll } from "./math"
import { createOverscrollBounce, type OverscrollBounceOptions } from "./session"

function wheel(init: Partial<WheelEventInit> = {}): WheelEvent {
    return new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 0, deltaY: 0, ...init })
}

function pointer(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
    return new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "touch",
        clientX: 0,
        clientY: 0,
        ...init,
    })
}

function translateY(el: HTMLElement): number {
    let t = el.style.transform
    if (!t) return 0
    let match = /^translateY\((-?[\d.]+)px\)$/.exec(t)
    expect(match).not.toBeNull()
    return Number(match![1])
}

function mount(options?: OverscrollBounceOptions, scrollHeight: number = 24000) {
    let scroller = document.createElement("div")
    let content = document.createElement("div")
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 480 })
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: scrollHeight })
    scroller.append(content)
    document.body.append(scroller)
    let bounce = createOverscrollBounce(scroller, content, options)
    return { scroller, content, bounce }
}

describe("createOverscrollBounce", () => {
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
        document.body.replaceChildren()
    })

    it("rubbers at the top on outward wheel and settles after idle", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(translateY(content)).toBeCloseTo(rubberBandOverscroll(80, 480), 10)
        expect(translateY(content)).toBeGreaterThan(0)
        expect(scroller.scrollTop).toBe(0)
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(content.dataset.yorozuOverscroll).toBe("top")
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS + 32)
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("rubbers at the bottom on outward wheel and settles after idle", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 24000 - 480
        scroller.dispatchEvent(wheel({ deltaY: 80 }))
        expect(content.dataset.yorozuOverscroll).toBe("bottom")
        expect(translateY(content)).toBeCloseTo(rubberBandOverscroll(-80, 480), 10)
        expect(translateY(content)).toBeLessThan(0)
        expect(scroller.scrollTop).toBe(24000 - 480)
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(content.dataset.yorozuOverscroll).toBe("bottom")
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS + 32)
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("does not rubber mid-list and paints none on create", () => {
        let { scroller, content, bounce } = mount()
        expect(content.dataset.yorozuOverscroll).toBe("none")
        scroller.scrollTop = 800
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("does not consume mid-list wheels so a later edge tick still rubbers", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 800
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("none")
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(translateY(content)).toBeGreaterThan(0)
        bounce.destroy()
    })

    it("ignores mouse pointer drags at the top", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(pointer("pointerdown", { pointerType: "mouse", clientY: 200 }))
        scroller.dispatchEvent(pointer("pointermove", { pointerType: "mouse", clientY: 280 }))
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("rubbers on touch drag at the top and settles on pointerup", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(pointer("pointerdown", { clientY: 200 }))
        scroller.dispatchEvent(pointer("pointermove", { clientY: 280 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(translateY(content)).toBeCloseTo(rubberBandOverscroll(80, 480), 10)
        scroller.dispatchEvent(pointer("pointerup", { clientY: 280 }))
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS + 32)
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("snaps immediately when getDurationMs returns 0", () => {
        let { scroller, content, bounce } = mount({ getDurationMs: () => 0 })
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("destroy is idempotent and detaches listeners", () => {
        let { scroller, content, bounce } = mount()
        bounce.destroy()
        expect(() => bounce.destroy()).not.toThrow()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).not.toBe("top")
        bounce.destroy()
    })

    it("does not stretch further on momentum coast ticks", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -20 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        let stretched = translateY(content)
        expect(stretched).toBeGreaterThan(0)
        let coast = wheel({ deltaY: -80 })
        Object.defineProperty(coast, "momentum", { value: true })
        scroller.dispatchEvent(coast)
        expect(Math.abs(translateY(content))).toBeLessThanOrEqual(Math.abs(stretched))
        await vi.advanceTimersByTimeAsync(WHEEL_RELEASE_MS + MOTION_SETTLE_MS + 32)
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("does not rubber ctrlKey wheel at the top", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80, ctrlKey: true }))
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("cancels a live settle when inward wheel crosses 0 so the tween does not revive", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(pointer("pointerdown", { clientY: 200 }))
        scroller.dispatchEvent(pointer("pointermove", { clientY: 280 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        scroller.dispatchEvent(pointer("pointerup", { clientY: 280 }))
        let inward = wheel({ deltaY: 100 })
        scroller.dispatchEvent(inward)
        expect(inward.defaultPrevented).toBe(false)
        expect(content.style.transform).toBe("")
        expect(content.dataset.yorozuOverscroll).toBe("none")
        await vi.advanceTimersByTimeAsync(16)
        expect(content.style.transform).toBe("")
        expect(content.dataset.yorozuOverscroll).toBe("none")
        bounce.destroy()
    })
})
