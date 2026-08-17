import { afterEach, describe, expect, it, vi } from "vitest"
import { zoomTransform } from "./math"
import { createPinchZoom } from "./pinch"

type Handler = (event: Record<string, unknown>) => void

type FakeNode = {
    style: CSSStyleDeclaration
    listeners: Map<string, Handler>
    addEventListener: (type: string, handler: Handler, options?: unknown) => void
    removeEventListener: (type: string, handler: Handler) => void
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

function createFakeEl(): FakeNode {
    let listeners = new Map<string, Handler>()
    return {
        style: createFakeStyle(),
        listeners,
        addEventListener(type, handler) {
            listeners.set(type, handler)
        },
        removeEventListener(type, handler) {
            if (listeners.get(type) === handler) listeners.delete(type)
        },
    }
}

function wheel(partial: Record<string, unknown>): Record<string, unknown> {
    return {
        ctrlKey: false,
        metaKey: false,
        deltaX: 0,
        deltaY: 0,
        offsetX: 0,
        offsetY: 0,
        preventDefault() {},
        ...partial,
    }
}

function mount() {
    let el = createFakeEl()
    let pinch = createPinchZoom({
        getEl: () => el as unknown as HTMLElement,
        getLayout: () => ({ width: 200, height: 200 }),
        getViewport: () => ({ width: 200, height: 200 }),
    })
    return { el, pinch }
}

describe("createPinchZoom", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("zooms at the cursor on ctrl/meta wheel", () => {
        let { el, pinch } = mount()
        let preventDefault = vi.fn()
        el.listeners.get("wheel")!(
            wheel({
                ctrlKey: true,
                deltaY: -Math.log(2) / 0.01,
                offsetX: 40,
                offsetY: 0,
                preventDefault,
            }),
        )
        expect(preventDefault).toHaveBeenCalled()
        expect(el.style.getPropertyValue("transform")).toBe(
            zoomTransform({ scale: 2, translateX: -40, translateY: 0 }),
        )
        pinch.destroy()
    })

    it("zooms at the cursor on meta wheel", () => {
        let { el, pinch } = mount()
        el.listeners.get("wheel")!(
            wheel({
                metaKey: true,
                deltaY: -Math.log(2) / 0.01,
                offsetX: 0,
                offsetY: 20,
            }),
        )
        expect(el.style.getPropertyValue("transform")).toBe(
            zoomTransform({ scale: 2, translateX: 0, translateY: -20 }),
        )
        pinch.destroy()
    })

    it("pans on wheel when scale is greater than 1", () => {
        let { el, pinch } = mount()
        pinch.setState({ scale: 2, translateX: 0, translateY: 0 })
        let preventDefault = vi.fn()
        el.listeners.get("wheel")!(wheel({ deltaX: 30, deltaY: 10, preventDefault }))
        expect(preventDefault).toHaveBeenCalled()
        expect(el.style.getPropertyValue("transform")).toBe(
            zoomTransform({ scale: 2, translateX: -30, translateY: -10 }),
        )
        pinch.destroy()
    })

    it("does not pan on wheel when scale is 1", () => {
        let { el, pinch } = mount()
        let preventDefault = vi.fn()
        el.listeners.get("wheel")!(wheel({ deltaX: 30, deltaY: 10, preventDefault }))
        expect(preventDefault).not.toHaveBeenCalled()
        expect(el.style.getPropertyValue("transform")).toBe("")
        pinch.destroy()
    })

    it("setState bounds and applies zoomTransform", () => {
        let { el, pinch } = mount()
        let next = pinch.setState({ scale: 2, translateX: 999, translateY: -999 })
        expect(next).toEqual({ scale: 2, translateX: 100, translateY: -100 })
        expect(el.style.getPropertyValue("transform")).toBe(zoomTransform(next))
        pinch.destroy()
    })

    it("reset restores identity", () => {
        let { el, pinch } = mount()
        pinch.setState({ scale: 3, translateX: 10, translateY: 10 })
        let next = pinch.reset()
        expect(next).toEqual({ scale: 1, translateX: 0, translateY: 0 })
        expect(el.style.getPropertyValue("transform")).toBe(zoomTransform(next))
        pinch.destroy()
    })

    it("destroy removes the wheel listener", () => {
        let { el, pinch } = mount()
        expect(el.listeners.has("wheel")).toBe(true)
        pinch.destroy()
        expect(el.listeners.has("wheel")).toBe(false)
    })
})
