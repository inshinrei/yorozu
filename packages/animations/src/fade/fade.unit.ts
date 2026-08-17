import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFade, FADE_EASING, FADE_MS } from "./fade"

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

describe("createFade", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("defaults to 120ms ease-out", async () => {
        expect(FADE_MS).toBe(120)
        expect(FADE_EASING).toBe("ease-out")
        let el = createFakeEl()
        let fade = createFade(el as unknown as HTMLElement)
        let playback = fade.setVisible(true)
        expect(animate).toHaveBeenCalledOnce()
        let frames = animate.mock.calls[0]![0] as Keyframe[]
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(frames).toEqual([{ opacity: "0" }, { opacity: "1" }])
        expect(opts.duration).toBe(120)
        expect(opts.easing).toBe("ease-out")
        expect(await playback.done).toBe(true)
    })

    it("setVisible(false) animates opacity 1 → 0", async () => {
        let el = createFakeEl()
        let fade = createFade(el as unknown as HTMLElement)
        await fade.setVisible(true).done
        animate.mockClear()
        let playback = fade.setVisible(false)
        let frames = animate.mock.calls[0]![0] as Keyframe[]
        expect(frames).toEqual([{ opacity: "1" }, { opacity: "0" }])
        expect(await playback.done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("0")
    })

    it("duration 0 snaps instantly and does not call animate", async () => {
        let el = createFakeEl()
        let fade = createFade(el as unknown as HTMLElement, { durationMs: 0 })
        expect(await fade.setVisible(true).done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("1")
        expect(await fade.setVisible(false).done).toBe(true)
        expect(el.style.getPropertyValue("opacity")).toBe("0")
        expect(animate).not.toHaveBeenCalled()
    })

    it("honors durationMs and easing overrides", () => {
        let el = createFakeEl()
        let fade = createFade(el as unknown as HTMLElement, { durationMs: 40, easing: "linear" })
        fade.setVisible(true)
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(opts.duration).toBe(40)
        expect(opts.easing).toBe("linear")
    })

    it("resolves false when cancelled mid-run", async () => {
        let cancel = vi.fn()
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let fade = createFade(el as unknown as HTMLElement)
        let playback = fade.setVisible(true)
        playback.cancel()
        expect(cancel).toHaveBeenCalled()
        expect(await playback.done).toBe(false)
    })

    it("a new setVisible cancels the in-flight playback", async () => {
        let cancel = vi.fn()
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let fade = createFade(el as unknown as HTMLElement)
        let first = fade.setVisible(true)
        let second = fade.setVisible(false)
        expect(await first.done).toBe(false)
        expect(cancel).toHaveBeenCalled()
        let frames = animate.mock.calls[1]![0] as Keyframe[]
        expect(frames).toEqual([{ opacity: "1" }, { opacity: "0" }])
        second.cancel()
        expect(await second.done).toBe(false)
    })
})
