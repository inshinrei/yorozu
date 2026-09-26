// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WHEEL_RELEASE_MS } from "../offset-drag/wheel-session"
import {
    OVERSCROLL_SPRING_MAX_MS,
    elasticOverscrollAt,
    invertOverscrollVisual,
    rubberBandAppKit,
    rubberBandOverscroll,
} from "./math"
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
        vi.restoreAllMocks()
        document.body.replaceChildren()
    })

    it("rubbers at the top on outward wheel and settles after idle", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(translateY(content)).toBeCloseTo(rubberBandAppKit(80), 10)
        expect(translateY(content)).toBeGreaterThan(0)
        expect(scroller.scrollTop).toBe(0)
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(content.dataset.yorozuOverscroll).toBe("top")
        await vi.advanceTimersByTimeAsync(OVERSCROLL_SPRING_MAX_MS + 32)
        expect(content.dataset.yorozuOverscroll).toBe("none")
        expect(content.style.transform).toBe("")
        bounce.destroy()
    })

    it("rubbers at the bottom on outward wheel and settles after idle", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 24000 - 480
        scroller.dispatchEvent(wheel({ deltaY: 80 }))
        expect(content.dataset.yorozuOverscroll).toBe("bottom")
        expect(translateY(content)).toBeCloseTo(rubberBandAppKit(-80), 10)
        expect(translateY(content)).toBeLessThan(0)
        expect(scroller.scrollTop).toBe(24000 - 480)
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(content.dataset.yorozuOverscroll).toBe("bottom")
        await vi.advanceTimersByTimeAsync(OVERSCROLL_SPRING_MAX_MS + 32)
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
        await vi.advanceTimersByTimeAsync(OVERSCROLL_SPRING_MAX_MS + 32)
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

    it("destroy releases pointer capture taken during a rubber drag", () => {
        let { scroller, content, bounce } = mount()
        let released: number[] = []
        scroller.setPointerCapture = vi.fn()
        scroller.releasePointerCapture = ((id: number) => {
            released.push(id)
        }) as typeof scroller.releasePointerCapture
        scroller.scrollTop = 0
        scroller.dispatchEvent(pointer("pointerdown", { clientY: 200 }))
        scroller.dispatchEvent(pointer("pointermove", { clientY: 280 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(scroller.setPointerCapture).toHaveBeenCalledWith(1)
        bounce.destroy()
        expect(released).toEqual([1])
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
        await vi.advanceTimersByTimeAsync(OVERSCROLL_SPRING_MAX_MS + 32)
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

    it("cancels a live settle when inward wheel crosses 0 so the spring does not revive", async () => {
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

    it("ignores a second touch while the first pointer is stored", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientY: 200 }))
        scroller.dispatchEvent(pointer("pointerdown", { pointerId: 2, clientY: 210 }))
        scroller.dispatchEvent(pointer("pointermove", { pointerId: 2, clientY: 300 }))
        expect(content.dataset.yorozuOverscroll).toBe("none")
        scroller.dispatchEvent(pointer("pointermove", { pointerId: 1, clientY: 280 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(translateY(content)).toBeCloseTo(rubberBandOverscroll(80, 480), 10)
        bounce.destroy()
    })

    it("releases pointer capture on destroy during a touch rubber", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.setPointerCapture = (): void => undefined
        let release = vi.fn()
        scroller.releasePointerCapture = release
        scroller.dispatchEvent(pointer("pointerdown", { clientY: 200 }))
        scroller.dispatchEvent(pointer("pointermove", { clientY: 280 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        bounce.destroy()
        expect(release).toHaveBeenCalledWith(1)
    })

    it("does not consume-gate after inward wheel stand-down", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        scroller.dispatchEvent(wheel({ deltaY: 100 }))
        expect(content.dataset.yorozuOverscroll).toBe("none")
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        bounce.destroy()
    })

    it("applies one coast impulse at the rest edge then ignores leftover", async () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        let first = wheel({ deltaY: -80 })
        Object.defineProperty(first, "momentum", { value: true })
        scroller.dispatchEvent(first)
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(translateY(content)).toBeCloseTo(rubberBandAppKit(80), 10)
        let stretched = translateY(content)
        let second = wheel({ deltaY: -80 })
        Object.defineProperty(second, "momentum", { value: true })
        scroller.dispatchEvent(second)
        expect(Math.abs(translateY(content))).toBeLessThanOrEqual(Math.abs(stretched))
        await vi.advanceTimersByTimeAsync(OVERSCROLL_SPRING_MAX_MS + 32)
        expect(content.dataset.yorozuOverscroll).toBe("none")
        bounce.destroy()
    })

    it("does not consume-gate after bounce lift so a later contact still rubbers", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(content.dataset.yorozuOverscroll).toBe("top")
        expect(translateY(content)).toBeCloseTo(rubberBandAppKit(160), 10)
        bounce.destroy()
    })

    it("paints AppKit visual on wheel and iOS visual on touch for the same travel", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        expect(translateY(content)).toBeCloseTo(rubberBandAppKit(80), 10)
        bounce.destroy()
        let again = mount()
        again.scroller.scrollTop = 0
        again.scroller.dispatchEvent(pointer("pointerdown", { clientY: 200 }))
        again.scroller.dispatchEvent(pointer("pointermove", { clientY: 280 }))
        expect(translateY(again.content)).toBeCloseTo(rubberBandOverscroll(80, 480), 10)
        again.bounce.destroy()
    })

    it("keeps visual when a wheel continues an iOS stretch", () => {
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(pointer("pointerdown", { clientY: 200 }))
        scroller.dispatchEvent(pointer("pointermove", { clientY: 280 }))
        let iosVisual = rubberBandOverscroll(80, 480)
        expect(translateY(content)).toBeCloseTo(iosVisual, 10)
        scroller.dispatchEvent(pointer("pointerup", { clientY: 280 }))
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        let appkitRaw = invertOverscrollVisual(iosVisual, "appkit", 480)
        expect(translateY(content)).toBeCloseTo(rubberBandAppKit(appkitRaw + 80), 10)
        bounce.destroy()
    })

    it("zeros lift velocity after 100ms of no samples before snap", async () => {
        let clock = 0
        vi.spyOn(performance, "now").mockImplementation(() => clock)
        let { scroller, content, bounce } = mount()
        scroller.scrollTop = 0
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        clock = 16
        await vi.advanceTimersByTimeAsync(16)
        scroller.dispatchEvent(wheel({ deltaY: -80 }))
        clock = 16 + WHEEL_RELEASE_MS
        await vi.advanceTimersByTimeAsync(WHEEL_RELEASE_MS)
        clock = 16 + WHEEL_RELEASE_MS + 16
        await vi.advanceTimersByTimeAsync(16)
        let x0 = rubberBandAppKit(160)
        expect(translateY(content)).not.toBeCloseTo(elasticOverscrollAt(x0, 250, 0.016), 2)
        expect(translateY(content)).toBeCloseTo(elasticOverscrollAt(x0, 0, 0.016), 5)
        bounce.destroy()
    })
})
