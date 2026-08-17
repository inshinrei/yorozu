import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createSwipeReveal,
    rubberSwipeOffset,
    shouldCommitSwipe,
    SWIPE_MAX,
    SWIPE_THRESHOLD,
} from "./swipe"

describe("shouldCommitSwipe", () => {
    it("commits at or past the threshold", () => {
        expect(SWIPE_THRESHOLD).toBe(56)
        expect(shouldCommitSwipe(55, 56)).toBe(false)
        expect(shouldCommitSwipe(56, 56)).toBe(true)
        expect(shouldCommitSwipe(80, 56)).toBe(true)
        expect(shouldCommitSwipe(0, 56)).toBe(false)
        expect(shouldCommitSwipe(-60, 56)).toBe(false)
    })
})

describe("rubberSwipeOffset", () => {
    it("passes through up to max and rubbers past it", () => {
        expect(SWIPE_MAX).toBe(80)
        expect(rubberSwipeOffset(40, 80)).toBe(40)
        expect(rubberSwipeOffset(80, 80)).toBe(80)
        expect(rubberSwipeOffset(160, 80)).toBe(120)
        expect(rubberSwipeOffset(0, 80)).toBe(0)
        expect(rubberSwipeOffset(-12, 80)).toBe(0)
    })
})

type Handler = (event: Record<string, unknown>) => void

type FakeNode = {
    style: CSSStyleDeclaration
    listeners: Map<string, Handler>
    addEventListener: (type: string, handler: Handler) => void
    removeEventListener: (type: string, handler: Handler) => void
    setPointerCapture: ReturnType<typeof vi.fn>
    releasePointerCapture: ReturnType<typeof vi.fn>
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
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
    }
}

function pointer(type: string, clientX: number): Record<string, unknown> {
    return { type, clientX, clientY: 0, pointerId: 1, preventDefault() {} }
}

describe("createSwipeReveal", () => {
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

    it("translates with rubber past max and commits past threshold", async () => {
        let el = createFakeEl()
        let onCommit = vi.fn()
        createSwipeReveal(el as unknown as HTMLElement, { onCommit })
        el.listeners.get("pointerdown")!(pointer("pointerdown", 0))
        el.listeners.get("pointermove")!(pointer("pointermove", 40))
        expect(el.style.getPropertyValue("transform")).toBe("translateX(40px)")
        el.listeners.get("pointermove")!(pointer("pointermove", 160))
        expect(el.style.getPropertyValue("transform")).toBe("translateX(120px)")
        el.listeners.get("pointerup")!(pointer("pointerup", 160))
        expect(onCommit).toHaveBeenCalledOnce()
        await vi.advanceTimersByTimeAsync(300)
        expect(el.style.getPropertyValue("transform")).toBe("translateX(80px)")
    })

    it("springs back to 0 when released below threshold", async () => {
        let el = createFakeEl()
        let onCommit = vi.fn()
        createSwipeReveal(el as unknown as HTMLElement, { onCommit })
        el.listeners.get("pointerdown")!(pointer("pointerdown", 10))
        el.listeners.get("pointermove")!(pointer("pointermove", 40))
        expect(el.style.getPropertyValue("transform")).toBe("translateX(30px)")
        el.listeners.get("pointerup")!(pointer("pointerup", 40))
        expect(onCommit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(300)
        expect(el.style.getPropertyValue("transform")).toBe("translateX(0px)")
    })

    it("destroy removes listeners so later pointers are ignored", () => {
        let el = createFakeEl()
        let onCommit = vi.fn()
        let swipe = createSwipeReveal(el as unknown as HTMLElement, { onCommit })
        expect(el.listeners.has("pointerdown")).toBe(true)
        swipe.destroy()
        expect(el.listeners.has("pointerdown")).toBe(false)
        expect(el.listeners.size).toBe(0)
    })
})
