import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AttachHandle, Key } from "../core/types"
import { createViewSlide, VIEW_SLIDE_MS, VIEW_SLIDE_SETTLE_SLACK_MS } from "./session"
import type { SlideDirection, ViewSlideMode } from "./transforms"

type FakeNode = {
    style: CSSStyleDeclaration
    offsetWidth: number
    animate: ReturnType<typeof vi.fn>
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
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
        offsetWidth: 320,
        animate,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }
}

let animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }))

function directionByKey(from: Key, to: Key): SlideDirection | null {
    if (from === to) return null
    return String(to) > String(from) ? "forward" : "back"
}

function makeSlide(opts?: {
    mode?: ViewSlideMode
    mountPolicy?: "keep-visited" | "active-plus-leaving"
    getDirection?: (from: Key, to: Key) => SlideDirection | null
}) {
    return createViewSlide({
        getMode: () => opts?.mode ?? "push",
        getDirection: opts?.getDirection ?? directionByKey,
        mountPolicy: opts?.mountPolicy,
    })
}

async function flushFrames(): Promise<void> {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
}

describe("createViewSlide", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }))
        vi.useFakeTimers()
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
        )
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("first setActive mounts without animating", () => {
        let slide = makeSlide()
        slide.setActive("a")
        expect(slide.mountedKeys).toContain("a")
        expect(slide.animating).toBe(false)
        expect(slide.leavingKey).toBeUndefined()
        expect(slide.role("a")).toBe("active")
        expect(slide.isMounted("a")).toBe(true)
        expect(slide.isVisible("a")).toBe(true)
    })

    it("setActive before attach marks leaving and entering", () => {
        let slide = makeSlide()
        slide.setActive("a")
        slide.setActive("b")
        expect(slide.animating).toBe(true)
        expect(slide.leavingKey).toBe("a")
        expect(slide.mountedKeys).toEqual(["a", "b"])

        let fromEl = createFakeEl() as unknown as HTMLElement
        let toEl = createFakeEl() as unknown as HTMLElement
        slide.attach(fromEl, "a")
        slide.attach(toEl, "b")
        expect(slide.role("b")).toBe("entering")
        expect(slide.role("a")).toBe("leaving")
        expect(slide.isVisible("a")).toBe(true)
        expect(slide.isVisible("b")).toBe(true)
    })

    it("mode none never stays animating after a microtask/raf flush", async () => {
        let slide = makeSlide({ mode: "none", mountPolicy: "active-plus-leaving" })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await Promise.resolve()
        await vi.runAllTimersAsync()
        expect(slide.animating).toBe(false)
        expect(slide.leavingKey).toBeUndefined()
        expect(slide.mountedKeys).toEqual(["b"])
        expect(animate).not.toHaveBeenCalled()
    })

    it("overlapping setActive cancels the previous generation", async () => {
        let cancels: Array<ReturnType<typeof vi.fn>> = []
        animate = vi.fn(() => {
            let cancel = vi.fn()
            cancels.push(cancel)
            let finished = new Promise<void>(() => undefined)
            return { finished, cancel }
        })

        let slide = makeSlide()
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await flushFrames()
        expect(slide.animating).toBe(true)
        expect(slide.role("b")).toBe("entering")
        expect(cancels.length).toBeGreaterThan(0)

        slide.setActive("c")
        slide.attach(createFakeEl() as unknown as HTMLElement, "c")
        await flushFrames()

        expect(cancels[0]).toHaveBeenCalled()
        expect(slide.animating).toBe(true)
        expect(slide.leavingKey).toBe("b")
        expect(slide.role("c")).toBe("entering")
        expect(slide.role("b")).toBe("leaving")
    })

    it("active-plus-leaving drops the leaving key after finish", async () => {
        let slide = makeSlide({ mountPolicy: "active-plus-leaving" })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        expect(slide.mountedKeys).toEqual(["a", "b"])
        await vi.runAllTimersAsync()
        expect(slide.animating).toBe(false)
        expect(slide.leavingKey).toBeUndefined()
        expect(slide.mountedKeys).toEqual(["b"])
        expect(slide.role("b")).toBe("active")
        expect(slide.isVisible("a")).toBe(false)
    })

    it("keep-visited retains the leaving key after finish", async () => {
        let slide = makeSlide({ mountPolicy: "keep-visited" })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await vi.runAllTimersAsync()
        expect(slide.animating).toBe(false)
        expect(slide.mountedKeys).toEqual(["a", "b"])
        expect(slide.role("a")).toBe("idle")
        expect(slide.role("b")).toBe("active")
        expect(slide.isVisible("a")).toBe(false)
    })

    it("destroy clears styles and listeners", async () => {
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel() {},
        }))
        let slide = makeSlide()
        let fromEl = createFakeEl()
        let toEl = createFakeEl()
        slide.setActive("a")
        let fromHandle: AttachHandle = slide.attach(fromEl as unknown as HTMLElement, "a")
        slide.setActive("b")
        let toHandle: AttachHandle = slide.attach(toEl as unknown as HTMLElement, "b")
        await flushFrames()

        expect(fromEl.style.transform).not.toBe("")
        expect(toEl.style.transform).not.toBe("")

        slide.destroy()
        expect(slide.animating).toBe(false)
        expect(slide.leavingKey).toBeUndefined()
        expect(fromEl.style.transform).toBe("")
        expect(toEl.style.transform).toBe("")
        expect(fromEl.style.opacity).toBe("")
        expect(toEl.style.opacity).toBe("")
        expect(fromEl.removeEventListener).toHaveBeenCalled()
        expect(toEl.removeEventListener).toHaveBeenCalled()
        expect(() => fromHandle.destroy()).not.toThrow()
        expect(() => toHandle.destroy()).not.toThrow()
    })

    it("missing direction swaps instantly", async () => {
        let slide = makeSlide({
            mountPolicy: "active-plus-leaving",
            getDirection: () => null,
        })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await Promise.resolve()
        await vi.runAllTimersAsync()
        expect(slide.animating).toBe(false)
        expect(slide.mountedKeys).toEqual(["b"])
        expect(animate).not.toHaveBeenCalled()
    })

    it("attach().update cancels an in-flight anim tied to the old key", async () => {
        let cancel = vi.fn()
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))

        let slide = makeSlide()
        let fromEl = createFakeEl()
        let toEl = createFakeEl()
        slide.setActive("a")
        let fromHandle = slide.attach(fromEl as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(toEl as unknown as HTMLElement, "b")
        await flushFrames()

        expect(slide.animating).toBe(true)
        expect(fromEl.style.transform).not.toBe("")
        expect(cancel).not.toHaveBeenCalled()

        fromHandle.update("c")
        expect(cancel).toHaveBeenCalled()
        expect(fromEl.style.transform).toBe("")
        expect(slide.animating).toBe(false)
    })

    it("settle fallback uses durationMs + slack", async () => {
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel() {},
        }))
        let slide = makeSlide({ mountPolicy: "active-plus-leaving" })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await vi.advanceTimersByTimeAsync(VIEW_SLIDE_MS + VIEW_SLIDE_SETTLE_SLACK_MS - 1)
        expect(slide.animating).toBe(true)
        await vi.advanceTimersByTimeAsync(1)
        expect(slide.animating).toBe(false)
        expect(slide.mountedKeys).toEqual(["b"])
    })

    it("cover uses 250ms ease-in-out on both panels", async () => {
        let slide = makeSlide({ mode: "cover" })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await flushFrames()
        expect(animate).toHaveBeenCalled()
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(opts.duration).toBe(250)
        expect(opts.easing).toBe("ease-in-out")
        let fromFrames = animate.mock.calls[0]![0] as Keyframe[]
        expect(fromFrames[1]).toMatchObject({ transform: "scale(0.7)", opacity: "0" })
        let toFrames = animate.mock.calls[1]![0] as Keyframe[]
        expect(toFrames[0]).toMatchObject({ transform: "translateX(200%)", opacity: "1" })
    })

    it("peek uses 300ms stack easing", async () => {
        let slide = makeSlide({ mode: "peek" })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await flushFrames()
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(opts.duration).toBe(300)
        expect(opts.easing).toBe("cubic-bezier(0.25, 1, 0.5, 1)")
        let fromFrames = animate.mock.calls[0]![0] as Keyframe[]
        expect(fromFrames[1]).toMatchObject({ transform: "translate3d(-20%, 0, 0)", opacity: "0.7" })
    })

    it("zoom uses 150ms ease", async () => {
        let slide = makeSlide({ mode: "zoom" })
        slide.setActive("a")
        slide.attach(createFakeEl() as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(createFakeEl() as unknown as HTMLElement, "b")
        await flushFrames()
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(opts.duration).toBe(150)
        expect(opts.easing).toBe("ease")
        let toFrames = animate.mock.calls[1]![0] as Keyframe[]
        expect(toFrames[0]).toMatchObject({ transform: "scale(1.1)", opacity: "0" })
        expect(toFrames[1]).toMatchObject({ transform: "scale(1)", opacity: "1" })
    })

    it("reveal uses 350ms ease-in and applies clip-path", async () => {
        let fromEl = createFakeEl()
        let toEl = createFakeEl()
        let slide = makeSlide({ mode: "reveal" })
        slide.setActive("a")
        slide.attach(fromEl as unknown as HTMLElement, "a")
        slide.setActive("b")
        slide.attach(toEl as unknown as HTMLElement, "b")
        expect(toEl.style.getPropertyValue("clip-path")).toBe("inset(0 100% 0 0)")
        await flushFrames()
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(opts.duration).toBe(350)
        expect(opts.easing).toBe("ease-in")
        let toFrames = animate.mock.calls[1]![0] as Keyframe[]
        expect(toFrames[0]).toMatchObject({ clipPath: "inset(0 100% 0 0)" })
        expect(toFrames[1]).toMatchObject({ clipPath: "inset(0 0 0 0)" })
        slide.destroy()
        expect(toEl.style.getPropertyValue("clip-path")).toBe("")
    })
})
