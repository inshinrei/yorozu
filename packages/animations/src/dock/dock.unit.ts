import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeAnimate } from "../_test/fake-animate"
import { createDock } from "./dock"
import { DOCK_EASING, DOCK_MS } from "./transforms"
import type { DockEdge, DockMode } from "./transforms"

type FakeNode = {
    style: CSSStyleDeclaration
    offsetWidth: number
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
        offsetWidth: 280,
        animate,
    }
}

let animate = createFakeAnimate()

function makeDock(opts?: { mode?: DockMode; edge?: DockEdge }) {
    return createDock({
        getMode: () => opts?.mode ?? "slide",
        edge: opts?.edge,
    })
}

async function flushFrames(): Promise<void> {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
}

describe("createDock", () => {
    beforeEach(() => {
        animate = createFakeAnimate()
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

    it("mode none opens and closes instantly with no leave phase", async () => {
        let dock = makeDock({ mode: "none" })
        let panel = createFakeEl()
        dock.attach(panel as unknown as HTMLElement)
        let open = dock.setOpen(true)
        expect(dock.mounted).toBe(true)
        expect(dock.leaving).toBe(false)
        expect(dock.animating).toBe(false)
        expect(animate).not.toHaveBeenCalled()
        expect(await open.done).toBe(true)

        let close = dock.setOpen(false)
        expect(dock.mounted).toBe(false)
        expect(dock.leaving).toBe(false)
        expect(dock.animating).toBe(false)
        expect(animate).not.toHaveBeenCalled()
        expect(await close.done).toBe(true)
    })

    it("waits for dual-rAF before transitioning open", async () => {
        let dock = makeDock({ mode: "slide" })
        let panel = createFakeEl()
        dock.attach(panel as unknown as HTMLElement)
        dock.setOpen(true)
        expect(dock.mounted).toBe(true)
        expect(dock.animating).toBe(true)
        expect(animate).not.toHaveBeenCalled()
        expect(panel.style.getPropertyValue("transform")).toBe("translateX(100%)")

        await flushFrames()
        expect(animate).toHaveBeenCalled()
        let frames = animate.mock.calls[0]![0]
        let opts = animate.mock.calls[0]![1]!
        expect(frames).toEqual([
            { transform: "translateX(100%)", opacity: "1" },
            { transform: "translateX(0)", opacity: "1" },
        ])
        expect(opts.duration).toBe(DOCK_MS)
        expect(opts.easing).toBe(DOCK_EASING)
    })

    it("fade mode uses the 1.5rem + opacity keyframes", async () => {
        let dock = makeDock({ mode: "fade", edge: "right" })
        dock.attach(createFakeEl() as unknown as HTMLElement)
        dock.setOpen(true)
        await flushFrames()
        let frames = animate.mock.calls[0]![0]
        expect(frames).toEqual([
            { transform: "translateX(1.5rem)", opacity: "0" },
            { transform: "translateX(0)", opacity: "1" },
        ])
    })

    it("backdrop fades opacity 0 ↔ 1 with the panel", async () => {
        let dock = makeDock({ mode: "slide" })
        let panel = createFakeEl()
        let backdrop = createFakeEl()
        dock.attach(panel as unknown as HTMLElement)
        dock.attachBackdrop(backdrop as unknown as HTMLElement)
        dock.setOpen(true)
        await flushFrames()
        expect(animate).toHaveBeenCalledTimes(2)
        let backdropFrames = animate.mock.calls[1]![0]
        expect(backdropFrames).toEqual([{ opacity: "0" }, { opacity: "1" }])
    })

    it("close runs a leave phase then unmounts", async () => {
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel: vi.fn(),
        }))
        let dock = makeDock({ mode: "slide" })
        let panel = createFakeEl()
        dock.attach(panel as unknown as HTMLElement)
        dock.setOpen(true)
        await flushFrames()
        expect(dock.mounted).toBe(true)

        animate.mockClear()
        dock.setOpen(false)
        expect(dock.mounted).toBe(true)
        expect(dock.leaving).toBe(true)
        expect(dock.animating).toBe(true)
        let frames = animate.mock.calls[0]![0]
        expect(frames).toEqual([
            { transform: "translateX(0)", opacity: "1" },
            { transform: "translateX(100%)", opacity: "1" },
        ])
    })

    it("none close never stays leaving after a flush", async () => {
        let dock = makeDock({ mode: "none" })
        dock.attach(createFakeEl() as unknown as HTMLElement)
        dock.setOpen(true)
        dock.setOpen(false)
        await flushFrames()
        expect(dock.leaving).toBe(false)
        expect(dock.mounted).toBe(false)
        expect(dock.animating).toBe(false)
    })

    it("cancelling mid-open resolves false and stops the animation", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let dock = makeDock({ mode: "slide" })
        let panel = createFakeEl()
        dock.attach(panel as unknown as HTMLElement)
        let playback = dock.setOpen(true)
        await flushFrames()
        expect(dock.animating).toBe(true)
        playback.cancel()
        expect(cancel).toHaveBeenCalled()
        expect(await playback.done).toBe(false)
        expect(dock.animating).toBe(false)
        expect(dock.mounted).toBe(false)
        expect(panel.style.transform).toBe("")
    })

    it("a newer setOpen cancels the previous generation", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let dock = makeDock({ mode: "slide" })
        dock.attach(createFakeEl() as unknown as HTMLElement)
        let first = dock.setOpen(true)
        await flushFrames()
        let second = dock.setOpen(false)
        expect(await first.done).toBe(false)
        expect(cancel).toHaveBeenCalled()
        expect(dock.leaving).toBe(true)
        expect(second).not.toBe(first)
        second.cancel()
    })

    it("destroy clears styles and aborts in-flight motion", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let dock = makeDock({ mode: "slide" })
        let panel = createFakeEl()
        dock.attach(panel as unknown as HTMLElement)
        let playback = dock.setOpen(true)
        await flushFrames()
        expect(panel.style.getPropertyValue("transform")).not.toBe("")
        dock.destroy()
        expect(dock.mounted).toBe(false)
        expect(dock.animating).toBe(false)
        expect(panel.style.getPropertyValue("transform")).toBe("")
        expect(panel.style.getPropertyValue("opacity")).toBe("")
        expect(cancel).toHaveBeenCalled()
        expect(await playback.done).toBe(false)
    })
})
