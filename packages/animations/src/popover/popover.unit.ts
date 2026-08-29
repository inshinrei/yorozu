import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeAnimate } from "../_test/fake-animate"
import { createPopover, POPOVER_EASING, POPOVER_MS, POPOVER_ORIGIN, POPOVER_SCALE } from "./popover"

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

describe("createPopover", () => {
    beforeEach(() => {
        animate = createFakeAnimate()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("playOpen scales from 0.92 with opacity 0 and default origin", async () => {
        expect(POPOVER_MS).toBe(120)
        expect(POPOVER_EASING).toBe("ease-out")
        expect(POPOVER_ORIGIN).toBe("center top")
        expect(POPOVER_SCALE).toBe(0.92)
        let el = createFakeEl()
        let popover = createPopover()
        let playback = popover.playOpen(el as unknown as HTMLElement)
        expect(el.style.getPropertyValue("transform-origin")).toBe("center top")
        let frames = animate.mock.calls[0]![0]
        let opts = animate.mock.calls[0]![1]!
        expect(frames).toEqual([
            { transform: "scale(0.92)", opacity: "0" },
            { transform: "scale(1)", opacity: "1" },
        ])
        expect(opts.duration).toBe(120)
        expect(opts.easing).toBe("ease-out")
        expect(await playback.done).toBe(true)
    })

    it("applies a custom transform-origin", () => {
        let el = createFakeEl()
        let popover = createPopover()
        popover.playOpen(el as unknown as HTMLElement, { origin: "bottom right" })
        expect(el.style.getPropertyValue("transform-origin")).toBe("bottom right")
    })

    it("playClose reverses the open keyframes", async () => {
        let el = createFakeEl()
        let popover = createPopover()
        await popover.playOpen(el as unknown as HTMLElement).done
        animate.mockClear()
        let playback = popover.playClose(el as unknown as HTMLElement)
        let frames = animate.mock.calls[0]![0]
        expect(frames).toEqual([
            { transform: "scale(1)", opacity: "1" },
            { transform: "scale(0.92)", opacity: "0" },
        ])
        expect(await playback.done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("0")
    })

    it("duration 0 snaps instantly and does not call animate", async () => {
        let el = createFakeEl()
        let popover = createPopover()
        expect(await popover.playOpen(el as unknown as HTMLElement, { durationMs: 0 }).done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("1")
        expect(el.style.getPropertyValue("transform")).toBe("scale(1)")
        expect(await popover.playClose(el as unknown as HTMLElement, { durationMs: 0 }).done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("0")
        expect(el.style.getPropertyValue("transform")).toBe("scale(0.92)")
        expect(animate).not.toHaveBeenCalled()
    })

    it("resolves false when cancelled mid-run", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let popover = createPopover()
        let playback = popover.playOpen(el as unknown as HTMLElement)
        playback.cancel()
        expect(cancel).toHaveBeenCalled()
        expect(await playback.done).toBe(false)
    })

    it("playClose cancels an in-flight playOpen", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let popover = createPopover()
        let open = popover.playOpen(el as unknown as HTMLElement)
        let close = popover.playClose(el as unknown as HTMLElement)
        expect(await open.done).toBe(false)
        expect(cancel).toHaveBeenCalled()
        let frames = animate.mock.calls[1]![0]
        expect(frames[0]).toMatchObject({ transform: "scale(1)", opacity: "1" })
        expect(frames[1]).toMatchObject({ transform: "scale(0.92)", opacity: "0" })
        close.cancel()
        expect(await close.done).toBe(false)
    })

    it("createPopover config scale changes closed keyframes", () => {
        let el = createFakeEl()
        let popover = createPopover({ scale: 0.85 })
        popover.playOpen(el as unknown as HTMLElement)
        let frames = animate.mock.calls[0]![0]
        expect(frames).toEqual([
            { transform: "scale(0.85)", opacity: "0" },
            { transform: "scale(1)", opacity: "1" },
        ])
    })

    it("play options scale is remembered on a later playClose", () => {
        let el = createFakeEl()
        let popover = createPopover()
        popover.playOpen(el as unknown as HTMLElement, { scale: 0.85 })
        animate.mockClear()
        popover.playClose(el as unknown as HTMLElement)
        let frames = animate.mock.calls[0]![0]
        expect(frames[1]).toMatchObject({ transform: "scale(0.85)", opacity: "0" })
    })

    it("duration 0 close snaps to the configured scale", async () => {
        let el = createFakeEl()
        let popover = createPopover({ scale: 0.85 })
        expect(await popover.playClose(el as unknown as HTMLElement, { durationMs: 0 }).done).toBe(true)
        expect(el.style.getPropertyValue("transform")).toBe("scale(0.85)")
        expect(animate).not.toHaveBeenCalled()
    })

    it("createPopover config seeds origin duration and easing", () => {
        let el = createFakeEl()
        let popover = createPopover({
            origin: "bottom left",
            durationMs: 40,
            easing: "linear",
        })
        popover.playOpen(el as unknown as HTMLElement)
        expect(el.style.getPropertyValue("transform-origin")).toBe("bottom left")
        let opts = animate.mock.calls[0]![1]!
        expect(opts.duration).toBe(40)
        expect(opts.easing).toBe("linear")
    })
})
