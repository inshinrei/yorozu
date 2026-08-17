import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSlidingIndicator, INDICATOR_EASING, INDICATOR_MS } from "./indicator"

type FakeNode = {
    style: CSSStyleDeclaration
    offsetLeft: number
    offsetTop: number
    offsetWidth: number
    offsetHeight: number
    animate: ReturnType<typeof vi.fn>
}

function createFakeStyle(): CSSStyleDeclaration {
    let store: Record<string, string> = {}
    return new Proxy(store, {
        get(target, prop) {
            if (prop === "setProperty") {
                return (key: string, value: string | null) => {
                    target[key] = value ?? ""
                }
            }
            if (prop === "removeProperty") {
                return (key: string) => {
                    delete target[key]
                }
            }
            if (prop === "getPropertyValue") {
                return (key: string) => target[key] ?? ""
            }
            return target[prop as string] ?? ""
        },
        set(target, prop, value) {
            target[prop as string] = String(value)
            return true
        },
    }) as unknown as CSSStyleDeclaration
}

function createFakeEl(box?: {
    left?: number
    top?: number
    width?: number
    height?: number
}): FakeNode {
    return {
        style: createFakeStyle(),
        offsetLeft: box?.left ?? 0,
        offsetTop: box?.top ?? 0,
        offsetWidth: box?.width ?? 80,
        offsetHeight: box?.height ?? 32,
        animate,
    }
}

let animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }))
let observe = vi.fn()
let disconnect = vi.fn()
let unobserve = vi.fn()
let ResizeObserverMock: ReturnType<typeof vi.fn>

describe("createSlidingIndicator", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }))
        observe = vi.fn()
        disconnect = vi.fn()
        unobserve = vi.fn()
        ResizeObserverMock = vi.fn(function (this: {
            observe: typeof observe
            disconnect: typeof disconnect
            unobserve: typeof unobserve
        }) {
            this.observe = observe
            this.disconnect = disconnect
            this.unobserve = unobserve
        })
        vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("exports default timing constants", () => {
        expect(INDICATOR_MS).toBe(300)
        expect(INDICATOR_EASING).toBe("cubic-bezier(0.25, 1, 0.5, 1)")
    })

    it("measure sets transform to active origin and size instantly", () => {
        let track = createFakeEl()
        let indicator = createFakeEl()
        let active = createFakeEl({ left: 24, top: 8, width: 96, height: 28 })

        let sliding = createSlidingIndicator({
            getTrack: () => track as unknown as HTMLElement,
            getIndicator: () => indicator as unknown as HTMLElement,
            getActive: () => active as unknown as HTMLElement,
        })

        sliding.measure()

        expect(indicator.style.transform).toBe("translate3d(24px, 8px, 0)")
        expect(indicator.style.width).toBe("96px")
        expect(indicator.style.height).toBe("28px")
        expect(animate).not.toHaveBeenCalled()
    })

    it("first measure does not call animate", () => {
        let track = createFakeEl()
        let indicator = createFakeEl()
        let active = createFakeEl({ left: 0, top: 0, width: 40, height: 20 })

        let sliding = createSlidingIndicator({
            getTrack: () => track as unknown as HTMLElement,
            getIndicator: () => indicator as unknown as HTMLElement,
            getActive: () => active as unknown as HTMLElement,
        })

        sliding.measure()
        expect(animate).not.toHaveBeenCalled()
    })

    it("second measure with active moved calls animate once when enabled", () => {
        let track = createFakeEl()
        let indicator = createFakeEl()
        let active = createFakeEl({ left: 0, top: 0, width: 40, height: 20 })

        let sliding = createSlidingIndicator({
            getTrack: () => track as unknown as HTMLElement,
            getIndicator: () => indicator as unknown as HTMLElement,
            getActive: () => active as unknown as HTMLElement,
            enabled: () => true,
        })

        sliding.measure()
        expect(animate).not.toHaveBeenCalled()

        active.offsetLeft = 120
        active.offsetTop = 0
        active.offsetWidth = 56
        active.offsetHeight = 20
        sliding.measure()

        expect(animate).toHaveBeenCalledTimes(1)
        let [keyframes, options] = animate.mock.calls[0]!
        expect(keyframes).toEqual([
            { transform: "translate3d(0px, 0px, 0)" },
            { transform: "translate3d(120px, 0px, 0)" },
        ])
        expect(options).toMatchObject({
            duration: INDICATOR_MS,
            easing: INDICATOR_EASING,
            fill: "forwards",
        })
        expect(indicator.style.transform).toBe("translate3d(120px, 0px, 0)")
        expect(indicator.style.width).toBe("56px")
        expect(indicator.style.height).toBe("20px")
    })

    it("enabled() === false snaps with no animate", () => {
        let track = createFakeEl()
        let indicator = createFakeEl()
        let active = createFakeEl({ left: 0, top: 0, width: 40, height: 20 })
        let enabled = true

        let sliding = createSlidingIndicator({
            getTrack: () => track as unknown as HTMLElement,
            getIndicator: () => indicator as unknown as HTMLElement,
            getActive: () => active as unknown as HTMLElement,
            enabled: () => enabled,
        })

        sliding.measure()
        active.offsetLeft = 80
        enabled = false
        sliding.measure()

        expect(animate).not.toHaveBeenCalled()
        expect(indicator.style.transform).toBe("translate3d(80px, 0px, 0)")
        expect(indicator.style.width).toBe("40px")
    })

    it("destroy disconnects the observer", () => {
        let track = createFakeEl()
        let indicator = createFakeEl()
        let active = createFakeEl({ left: 0, top: 0 })

        let sliding = createSlidingIndicator({
            getTrack: () => track as unknown as HTMLElement,
            getIndicator: () => indicator as unknown as HTMLElement,
            getActive: () => active as unknown as HTMLElement,
        })

        expect(ResizeObserverMock).toHaveBeenCalled()
        expect(observe).toHaveBeenCalledWith(track)

        sliding.destroy()
        expect(disconnect).toHaveBeenCalled()
    })

    it("ResizeObserver callback triggers measure", () => {
        let track = createFakeEl()
        let indicator = createFakeEl()
        let active = createFakeEl({ left: 10, top: 4, width: 50, height: 18 })
        let roCb: ResizeObserverCallback | null = null

        ResizeObserverMock = vi.fn(function (
            this: {
                observe: typeof observe
                disconnect: typeof disconnect
                unobserve: typeof unobserve
            },
            cb: ResizeObserverCallback,
        ) {
            roCb = cb
            this.observe = observe
            this.disconnect = disconnect
            this.unobserve = unobserve
        })
        vi.stubGlobal("ResizeObserver", ResizeObserverMock)

        createSlidingIndicator({
            getTrack: () => track as unknown as HTMLElement,
            getIndicator: () => indicator as unknown as HTMLElement,
            getActive: () => active as unknown as HTMLElement,
        })

        expect(roCb).not.toBeNull()
        roCb!([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)
        expect(indicator.style.transform).toBe("translate3d(10px, 4px, 0)")
    })

    it("honors durationMs and easing overrides", () => {
        let track = createFakeEl()
        let indicator = createFakeEl()
        let active = createFakeEl({ left: 0, top: 0, width: 40, height: 20 })

        let sliding = createSlidingIndicator({
            getTrack: () => track as unknown as HTMLElement,
            getIndicator: () => indicator as unknown as HTMLElement,
            getActive: () => active as unknown as HTMLElement,
            durationMs: 120,
            easing: "linear",
        })

        sliding.measure()
        active.offsetLeft = 40
        sliding.measure()

        expect(animate).toHaveBeenCalledTimes(1)
        let options = animate.mock.calls[0]![1]
        expect(options).toMatchObject({ duration: 120, easing: "linear" })
    })
})
