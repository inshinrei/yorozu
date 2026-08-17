import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DIGIT_FLIP_MS } from "./slots"
import { playDigitFlip, playPresencePop, PRESENCE_POP_MS } from "./play"

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

describe("playDigitFlip", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("rotates X from 90deg to 0 over 200ms", async () => {
        expect(DIGIT_FLIP_MS).toBe(200)
        let el = createFakeEl()
        let playback = playDigitFlip(el as unknown as HTMLElement)
        expect(animate).toHaveBeenCalledOnce()
        let frames = animate.mock.calls[0]![0] as Keyframe[]
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(frames).toEqual([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }])
        expect(opts.duration).toBe(200)
        expect(await playback.done).toBe(true)
    })

    it("resolves false when cancelled mid-run", async () => {
        let cancel = vi.fn()
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let el = createFakeEl()
        let playback = playDigitFlip(el as unknown as HTMLElement)
        playback.cancel()
        expect(cancel).toHaveBeenCalled()
        expect(await playback.done).toBe(false)
    })
})

describe("playPresencePop", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
    })

    it("scales 0.6 → 1 with opacity over 200ms", async () => {
        expect(PRESENCE_POP_MS).toBe(200)
        let el = createFakeEl()
        let playback = playPresencePop(el as unknown as HTMLElement)
        let frames = animate.mock.calls[0]![0] as Keyframe[]
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(frames).toEqual([
            { transform: "scale(0.6)", opacity: "0" },
            { transform: "scale(1)", opacity: "1" },
        ])
        expect(opts.duration).toBe(200)
        expect(await playback.done).toBe(true)
    })
})
