import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPopover, POPOVER_EASING, POPOVER_MS, POPOVER_ORIGIN } from "./popover"

type FakeNode = {
    style: CSSStyleDeclaration
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

function createFakeEl(): FakeNode {
    return {
        style: createFakeStyle(),
        animate,
    }
}

let animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))

describe("createPopover", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("playOpen scales from 0.92 with opacity 0 and default origin", async () => {
        expect(POPOVER_MS).toBe(120)
        expect(POPOVER_EASING).toBe("ease-out")
        expect(POPOVER_ORIGIN).toBe("center top")
        let el = createFakeEl()
        let popover = createPopover()
        let playback = popover.playOpen(el as unknown as HTMLElement)
        expect(el.style.getPropertyValue("transform-origin")).toBe("center top")
        let frames = animate.mock.calls[0]![0] as Keyframe[]
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
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
        let frames = animate.mock.calls[0]![0] as Keyframe[]
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
        animate = vi.fn(() => ({
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
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let popover = createPopover()
        let open = popover.playOpen(el as unknown as HTMLElement)
        let close = popover.playClose(el as unknown as HTMLElement)
        expect(await open.done).toBe(false)
        expect(cancel).toHaveBeenCalled()
        let frames = animate.mock.calls[1]![0] as Keyframe[]
        expect(frames[0]).toMatchObject({ transform: "scale(1)", opacity: "1" })
        expect(frames[1]).toMatchObject({ transform: "scale(0.92)", opacity: "0" })
        close.cancel()
        expect(await close.done).toBe(false)
    })
})
