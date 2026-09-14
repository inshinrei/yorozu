import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeAnimate } from "../_test/fake-animate"
import {
    createStackLayer,
    STACK_LAYER_EASING,
    STACK_LAYER_MAX_BEHIND,
    STACK_LAYER_MS,
    STACK_LAYER_OFFSET_PX,
    STACK_LAYER_OPACITY_STEP,
    STACK_LAYER_SCALE_STEP,
    stackLayerFrame,
} from "./layer"

type FakeNode = {
    style: CSSStyleDeclaration
    animate: ReturnType<typeof createFakeAnimate>
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
    return {
        style: createFakeStyle(),
        animate,
    }
}

let animate = createFakeAnimate()

describe("createStackLayer", () => {
    beforeEach(() => {
        animate = createFakeAnimate()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("stackLayerFrame depth 0 is identity", () => {
        expect(STACK_LAYER_MS).toBe(200)
        expect(STACK_LAYER_EASING).toBe("cubic-bezier(0.25, 0.1, 0.25, 1)")
        expect(STACK_LAYER_MAX_BEHIND).toBe(3)
        expect(STACK_LAYER_SCALE_STEP).toBe(0.05)
        expect(STACK_LAYER_OPACITY_STEP).toBe(0.2)
        expect(STACK_LAYER_OFFSET_PX).toBe(8)
        expect(stackLayerFrame(0)).toEqual({ transform: "translateY(0px) scale(1)", opacity: "1" })
    })

    it("stackLayerFrame depth 1 peeks up by default", () => {
        expect(stackLayerFrame(1)).toEqual({ transform: "translateY(-8px) scale(0.95)", opacity: "0.8" })
    })

    it("stackLayerFrame depth 3 is the last visible behind card", () => {
        expect(stackLayerFrame(3)).toEqual({ transform: "translateY(-24px) scale(0.85)", opacity: "0.4" })
    })

    it("stackLayerFrame depth 4 is opacity 0", () => {
        expect(stackLayerFrame(4).opacity).toBe("0")
        expect(stackLayerFrame(4).transform).toBe("translateY(-32px) scale(0.8)")
    })

    it("axis down peeks with positive Y", () => {
        expect(stackLayerFrame(2, { axis: "down" }).transform).toBe("translateY(16px) scale(0.9)")
    })

    it("set animates from hidden to depth and sets origin/z-index", async () => {
        let el = createFakeEl()
        let layer = createStackLayer()
        let playback = layer.set(el as unknown as HTMLElement, 1)
        expect(el.style.getPropertyValue("transform-origin")).toBe("center bottom")
        expect(el.style.getPropertyValue("z-index")).toBe("99")
        expect(animate.mock.calls[0]![0]).toEqual([stackLayerFrame(4), stackLayerFrame(1)])
        expect(animate.mock.calls[0]![1]).toMatchObject({
            duration: 200,
            easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
            fill: "forwards",
        })
        expect(await playback.done).toBe(true)
        expect(el.style.getPropertyValue("transform")).toBe(stackLayerFrame(1).transform)
        expect(el.style.getPropertyValue("opacity")).toBe("0.8")
        layer.destroy()
    })

    it("second set retargets from the last to-frame", async () => {
        let el = createFakeEl()
        let layer = createStackLayer()
        await layer.set(el as unknown as HTMLElement, 0).done
        animate.mockClear()
        layer.set(el as unknown as HTMLElement, 2, { axis: "down" })
        expect(animate.mock.calls[0]![0]).toEqual([stackLayerFrame(0), stackLayerFrame(2, { axis: "down" })])
        expect(el.style.getPropertyValue("transform-origin")).toBe("center top")
        layer.destroy()
    })

    it("duration 0 snaps and does not call animate", async () => {
        let el = createFakeEl()
        let layer = createStackLayer({ durationMs: 0 })
        expect(await layer.set(el as unknown as HTMLElement, 0).done).toBe(true)
        expect(animate).not.toHaveBeenCalled()
        expect(el.style.getPropertyValue("opacity")).toBe("1")
        layer.destroy()
    })

    it("same depth while idle is a no-op", async () => {
        let el = createFakeEl()
        let layer = createStackLayer()
        await layer.set(el as unknown as HTMLElement, 1).done
        animate.mockClear()
        expect(await layer.set(el as unknown as HTMLElement, 1).done).toBe(true)
        expect(animate).not.toHaveBeenCalled()
        layer.destroy()
    })

    it("same depth with a new axis re-animates", async () => {
        let el = createFakeEl()
        let layer = createStackLayer()
        await layer.set(el as unknown as HTMLElement, 1).done
        animate.mockClear()
        layer.set(el as unknown as HTMLElement, 1, { axis: "down" })
        expect(animate).toHaveBeenCalledOnce()
        expect(animate.mock.calls[0]![0]).toEqual([stackLayerFrame(1), stackLayerFrame(1, { axis: "down" })])
        expect(el.style.getPropertyValue("transform-origin")).toBe("center top")
        layer.destroy()
    })

    it("a new set on the same el cancels the in-flight playback", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let layer = createStackLayer()
        let first = layer.set(el as unknown as HTMLElement, 1)
        let second = layer.set(el as unknown as HTMLElement, 2)
        expect(await first.done).toBe(false)
        expect(cancel).toHaveBeenCalled()
        second.cancel()
        expect(await second.done).toBe(false)
        layer.destroy()
    })

    it("two elements animate independently", async () => {
        let a = createFakeEl()
        let b = createFakeEl()
        let layer = createStackLayer()
        layer.set(a as unknown as HTMLElement, 0)
        layer.set(b as unknown as HTMLElement, 1)
        expect(animate).toHaveBeenCalledTimes(2)
        layer.destroy()
    })

    it("forget clears styles; destroy is idempotent", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let layer = createStackLayer()
        let playback = layer.set(el as unknown as HTMLElement, 1)
        layer.forget(el as unknown as HTMLElement)
        expect(cancel).toHaveBeenCalled()
        expect(await playback.done).toBe(false)
        expect(el.style.getPropertyValue("will-change")).toBe("")
        expect(el.style.getPropertyValue("z-index")).toBe("")
        expect(el.style.getPropertyValue("transform")).toBe("")
        expect(el.style.getPropertyValue("opacity")).toBe("")
        expect(el.style.getPropertyValue("transform-origin")).toBe("")
        layer.destroy()
        expect(() => layer.destroy()).not.toThrow()
    })
})
