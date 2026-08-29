import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import {
    MENU_POPOVER_CLOSE_EASING,
    MENU_POPOVER_CLOSE_MS,
    MENU_POPOVER_OPEN_EASING,
    MENU_POPOVER_OPEN_MS,
    MENU_POPOVER_SCALE,
    createMenuPopover,
} from "./popover"

type FakeAnimation = {
    finished: Promise<void>
    cancel: () => void
}

type FakeAnimate = (this: unknown, frames: Keyframe[], options?: KeyframeAnimationOptions) => FakeAnimation

function createFakeAnimate(impl?: FakeAnimate): Mock<FakeAnimate> {
    return vi.fn<FakeAnimate>(impl ?? (() => ({ finished: Promise.resolve(), cancel: vi.fn() })))
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

type FakeNode = {
    style: CSSStyleDeclaration
    animate: ReturnType<typeof createFakeAnimate>
}

let animate = createFakeAnimate()

function createFakeEl(): FakeNode {
    return {
        style: createFakeStyle(),
        animate,
    }
}

describe("createMenuPopover", () => {
    beforeEach(() => {
        animate = createFakeAnimate()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("playOpen scales from 0.85 over 150ms cubic-bezier", () => {
        expect(MENU_POPOVER_SCALE).toBe(0.85)
        expect(MENU_POPOVER_OPEN_MS).toBe(150)
        expect(MENU_POPOVER_OPEN_EASING).toBe("cubic-bezier(0.2, 0, 0.2, 1)")
        let el = createFakeEl()
        let popover = createMenuPopover()
        popover.playOpen(el as unknown as HTMLElement, {
            durationMs: MENU_POPOVER_OPEN_MS,
            easing: MENU_POPOVER_OPEN_EASING,
        })
        let frames = animate.mock.calls[0]![0]
        let opts = animate.mock.calls[0]![1]!
        expect(frames).toEqual([
            { transform: "scale(0.85)", opacity: "0" },
            { transform: "scale(1)", opacity: "1" },
        ])
        expect(opts.duration).toBe(150)
        expect(opts.easing).toBe("cubic-bezier(0.2, 0, 0.2, 1)")
    })

    it("playClose uses 200ms ease-in back to scale 0.85", async () => {
        expect(MENU_POPOVER_CLOSE_MS).toBe(200)
        expect(MENU_POPOVER_CLOSE_EASING).toBe("ease-in")
        let el = createFakeEl()
        let popover = createMenuPopover()
        await popover.playOpen(el as unknown as HTMLElement, {
            durationMs: MENU_POPOVER_OPEN_MS,
            easing: MENU_POPOVER_OPEN_EASING,
        }).done
        animate.mockClear()
        let playback = popover.playClose(el as unknown as HTMLElement, {
            durationMs: MENU_POPOVER_CLOSE_MS,
            easing: MENU_POPOVER_CLOSE_EASING,
        })
        let frames = animate.mock.calls[0]![0]
        let opts = animate.mock.calls[0]![1]!
        expect(frames).toEqual([
            { transform: "scale(1)", opacity: "1" },
            { transform: "scale(0.85)", opacity: "0" },
        ])
        expect(opts.duration).toBe(200)
        expect(opts.easing).toBe("ease-in")
        expect(await playback.done).toBe(true)
    })

    it("durationMs 0 never animates", async () => {
        let el = createFakeEl()
        let popover = createMenuPopover()
        expect(await popover.playOpen(el as unknown as HTMLElement, { durationMs: 0 }).done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("1")
        expect(el.style.getPropertyValue("transform")).toBe("scale(1)")
        expect(await popover.playClose(el as unknown as HTMLElement, { durationMs: 0 }).done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("0")
        expect(el.style.getPropertyValue("transform")).toBe("scale(0.85)")
        expect(animate).not.toHaveBeenCalled()
    })

    it("last origin persists onto a later playClose", () => {
        let el = createFakeEl()
        let popover = createMenuPopover()
        popover.playOpen(el as unknown as HTMLElement, { origin: "40px 10px" })
        expect(el.style.getPropertyValue("transform-origin")).toBe("40px 10px")
        animate.mockClear()
        popover.playClose(el as unknown as HTMLElement)
        expect(el.style.getPropertyValue("transform-origin")).toBe("40px 10px")
    })
})
