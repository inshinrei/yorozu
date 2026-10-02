import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { flushDomSchedule } from "../core/dom-schedule"
import { createHeavyAnimationLock } from "../core/heavy-lock"
import { MOTION_SETTLE_MS } from "../core/motion-timing"
import { createLayoutGrow, LAYOUT_GROW_EPSILON_PX, LAYOUT_GROW_MS } from "./grow"

type Fixture = {
    naturalH: number
    naturalW: number
    style: { height: string; width: string }
}

function createFixture(naturalH = 40, naturalW = 20): { fixture: Fixture; el: HTMLElement } {
    let fixture: Fixture = {
        naturalH,
        naturalW,
        style: { height: "", width: "" },
    }
    let el = {
        style: fixture.style,
        get offsetHeight() {
            return fixture.naturalH
        },
        get offsetWidth() {
            return fixture.naturalW
        },
    }
    return { fixture, el: el as unknown as HTMLElement }
}

let observe = vi.fn()
let disconnect = vi.fn()
let unobserve = vi.fn()
let ResizeObserverMock: ReturnType<typeof vi.fn>
let roCallback: ResizeObserverCallback | undefined

function fireResize(): void {
    roCallback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)
}

describe("createLayoutGrow", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
        )
        vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
        observe = vi.fn()
        disconnect = vi.fn()
        unobserve = vi.fn()
        roCallback = undefined
        ResizeObserverMock = vi.fn(function (
            this: {
                observe: typeof observe
                disconnect: typeof disconnect
                unobserve: typeof unobserve
            },
            cb: ResizeObserverCallback,
        ) {
            roCallback = cb
            this.observe = observe
            this.disconnect = disconnect
            this.unobserve = unobserve
        })
        vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    })
    afterEach(() => {
        flushDomSchedule()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("exports LAYOUT_GROW_MS as MOTION_SETTLE_MS and EPSILON 1", () => {
        expect(LAYOUT_GROW_MS).toBe(MOTION_SETTLE_MS)
        expect(LAYOUT_GROW_EPSILON_PX).toBe(1)
    })

    it("duration 0 play writes then applyRest without holding the lock", async () => {
        let { fixture, el } = createFixture(40)
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let grow = createLayoutGrow({ el, lock })
        let playback = grow.play(80, 0)
        flushDomSchedule()
        expect(await playback.done).toBe(true)
        expect(fixture.style.height).toBe("")
        expect(lock.isHeld()).toBe(false)
        grow.destroy()
    })

    it("observer invert writes previous px then tweens to the new size", async () => {
        let { fixture, el } = createFixture(40)
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let grow = createLayoutGrow({ el, lock })
        fixture.naturalH = 80
        fireResize()
        expect(fixture.style.height).toBe("40px")
        flushDomSchedule()
        expect(lock.isHeld()).toBe(true)
        await vi.advanceTimersByTimeAsync(LAYOUT_GROW_MS + 64)
        flushDomSchedule()
        expect(fixture.style.height).toBe("")
        expect(lock.isHeld()).toBe(false)
        grow.destroy()
    })

    it("ignores observer ticks while writing", async () => {
        let { fixture, el } = createFixture(40)
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let grow = createLayoutGrow({ el, lock })
        let playback = grow.play(80)
        flushDomSchedule()
        fixture.naturalH = 120
        fireResize()
        await vi.advanceTimersByTimeAsync(LAYOUT_GROW_MS + 64)
        flushDomSchedule()
        expect(await playback.done).toBe(true)
        expect(lock.isHeld()).toBe(false)
        grow.destroy()
    })

    it("skips |delta| <= EPSILON", () => {
        let { fixture, el } = createFixture(40)
        let grow = createLayoutGrow({ el })
        fixture.naturalH = 41
        fireResize()
        expect(fixture.style.height).toBe("")
        grow.destroy()
    })

    it("isEnabled false snaps last without lock", () => {
        let { fixture, el } = createFixture(40)
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let grow = createLayoutGrow({ el, lock, isEnabled: () => false })
        fixture.naturalH = 80
        fireResize()
        expect(lock.isHeld()).toBe(false)
        expect(fixture.style.height).toBe("")
        grow.destroy()
    })

    it("cancel and snap release the lock", async () => {
        let { el } = createFixture(40)
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        let grow = createLayoutGrow({ el, lock })
        let playback = grow.play(80)
        flushDomSchedule()
        expect(lock.isHeld()).toBe(true)
        playback.cancel()
        flushDomSchedule()
        expect(await playback.done).toBe(false)
        expect(lock.isHeld()).toBe(false)
        let again = grow.play(90)
        flushDomSchedule()
        expect(lock.isHeld()).toBe(true)
        grow.snap()
        flushDomSchedule()
        expect(await again.done).toBe(false)
        expect(lock.isHeld()).toBe(false)
        grow.destroy()
    })

    it("onDelta gets signed steps during the tween, not a zero invert", async () => {
        let { fixture, el } = createFixture(40)
        let deltas: number[] = []
        let grow = createLayoutGrow({
            el,
            onDelta: (deltaPx) => {
                deltas.push(deltaPx)
            },
        })
        fixture.naturalH = 80
        fireResize()
        flushDomSchedule()
        await vi.advanceTimersByTimeAsync(LAYOUT_GROW_MS + 64)
        flushDomSchedule()
        expect(deltas.length).toBeGreaterThan(0)
        expect(deltas.every((delta) => delta > 0)).toBe(true)
        expect(deltas.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(40)
        grow.destroy()
    })

    it("axis inline writes width", async () => {
        let { fixture, el } = createFixture(40, 20)
        let grow = createLayoutGrow({ el, axis: "inline" })
        fixture.naturalW = 50
        fireResize()
        expect(fixture.style.width).toBe("20px")
        expect(fixture.style.height).toBe("")
        flushDomSchedule()
        await vi.advanceTimersByTimeAsync(LAYOUT_GROW_MS + 64)
        flushDomSchedule()
        expect(fixture.style.width).toBe("")
        expect(fixture.style.height).toBe("")
        grow.destroy()
    })

    it("rebases lastEmitted on disabled observer so later invert is a zero step", async () => {
        let enabled = false
        let deltas: number[] = []
        let { fixture, el } = createFixture(40)
        let grow = createLayoutGrow({
            el,
            isEnabled: () => enabled,
            onDelta: (deltaPx) => {
                deltas.push(deltaPx)
            },
        })
        fixture.naturalH = 200
        fireResize()
        expect(deltas).toEqual([])
        enabled = true
        fixture.naturalH = 220
        fireResize()
        expect(fixture.style.height).toBe("200px")
        expect(deltas).toEqual([])
        flushDomSchedule()
        await vi.advanceTimersByTimeAsync(LAYOUT_GROW_MS + 64)
        flushDomSchedule()
        expect(deltas.length).toBeGreaterThan(0)
        expect(deltas.every((delta) => delta > 0)).toBe(true)
        expect(deltas.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(20)
        grow.destroy()
    })

    it("rebases last after snap so the next invert does not dump remainder", async () => {
        let deltas: number[] = []
        let { fixture, el } = createFixture(40)
        let grow = createLayoutGrow({
            el,
            onDelta: (deltaPx) => {
                deltas.push(deltaPx)
            },
        })
        let playback = grow.play(80)
        flushDomSchedule()
        await vi.advanceTimersByTimeAsync(16)
        flushDomSchedule()
        await vi.advanceTimersByTimeAsync(64)
        flushDomSchedule()
        grow.snap()
        flushDomSchedule()
        expect(await playback.done).toBe(false)
        let afterSnap = deltas.length
        fixture.naturalH = 100
        fireResize()
        expect(fixture.style.height).toBe("40px")
        expect(deltas.slice(afterSnap)).toEqual([])
        flushDomSchedule()
        await vi.advanceTimersByTimeAsync(LAYOUT_GROW_MS + 64)
        flushDomSchedule()
        let afterInvert = deltas.slice(afterSnap)
        expect(afterInvert.length).toBeGreaterThan(0)
        expect(afterInvert.every((delta) => delta > 0)).toBe(true)
        expect(afterInvert.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(60)
        grow.destroy()
    })
})
