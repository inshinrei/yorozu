import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeAnimate } from "../_test/fake-animate"
import { createSpoiler, SPOILER_EASING, SPOILER_MS } from "./spoiler"

type FakeNode = {
    tagName: string
    style: CSSStyleDeclaration
    children: FakeNode[]
    parentNode: FakeNode | null
    clientWidth: number
    clientHeight: number
    animate: ReturnType<typeof createFakeAnimate>
    getContext: ReturnType<typeof vi.fn>
    appendChild: (child: FakeNode) => FakeNode
    remove: () => void
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

function createFakeEl(tag = "div"): FakeNode {
    let node: FakeNode = {
        tagName: tag.toUpperCase(),
        style: createFakeStyle(),
        children: [],
        parentNode: null,
        clientWidth: 120,
        clientHeight: 80,
        animate,
        getContext: vi.fn(() => ({
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
        })),
        appendChild(child: FakeNode) {
            child.parentNode = node
            node.children.push(child)
            return child
        },
        remove() {
            if (!node.parentNode) return
            let sibs = node.parentNode.children
            let i = sibs.indexOf(node)
            if (i >= 0) sibs.splice(i, 1)
            node.parentNode = null
        },
    }
    return node
}

let animate = createFakeAnimate()

describe("createSpoiler", () => {
    beforeEach(() => {
        animate = createFakeAnimate()
        vi.stubGlobal("document", {
            createElement: (tag: string) => createFakeEl(tag),
        })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("appends a canvas overlay and paints a dot field", () => {
        expect(SPOILER_MS).toBe(200)
        expect(SPOILER_EASING).toBe("ease-out")
        let el = createFakeEl()
        let spoiler = createSpoiler(el as unknown as HTMLElement, { revealed: () => false })
        let canvas = el.children[0]!
        expect(canvas.tagName).toBe("CANVAS")
        expect(canvas.style.getPropertyValue("position")).toBe("absolute")
        expect(canvas.getContext).toHaveBeenCalled()
        spoiler.destroy()
    })

    it("reveal fades the overlay out", async () => {
        let el = createFakeEl()
        let spoiler = createSpoiler(el as unknown as HTMLElement, { revealed: () => false })
        let playback = spoiler.reveal()
        expect(animate).toHaveBeenCalledOnce()
        let frames = animate.mock.calls[0]![0]
        let opts = animate.mock.calls[0]![1]!
        expect(frames).toEqual([{ opacity: "1" }, { opacity: "0" }])
        expect(opts.duration).toBe(200)
        expect(opts.easing).toBe("ease-out")
        expect(await playback.done).toBe(true)
        expect(el.children[0]!.style.getPropertyValue("opacity")).toBe("0")
        spoiler.destroy()
    })

    it("reset restores the overlay", async () => {
        let el = createFakeEl()
        let spoiler = createSpoiler(el as unknown as HTMLElement, { revealed: () => false })
        await spoiler.reveal().done
        animate.mockClear()
        let playback = spoiler.reset()
        let frames = animate.mock.calls[0]![0]
        expect(frames).toEqual([{ opacity: "0" }, { opacity: "1" }])
        expect(await playback.done).toBe(true)
        expect(el.children[0]!.style.getPropertyValue("opacity")).toBe("1")
        spoiler.destroy()
    })

    it("duration 0 snaps reveal and reset", async () => {
        let el = createFakeEl()
        let spoiler = createSpoiler(el as unknown as HTMLElement, {
            revealed: () => false,
            durationMs: 0,
        })
        expect(await spoiler.reveal().done).toBe(true)
        expect(el.children[0]!.style.getPropertyValue("opacity")).toBe("0")
        expect(await spoiler.reset().done).toBe(true)
        expect(el.children[0]!.style.getPropertyValue("opacity")).toBe("1")
        expect(animate).not.toHaveBeenCalled()
        spoiler.destroy()
    })

    it("starts hidden when revealed() is already true", () => {
        let el = createFakeEl()
        let spoiler = createSpoiler(el as unknown as HTMLElement, { revealed: () => true })
        expect(el.children[0]!.style.getPropertyValue("opacity")).toBe("0")
        expect(animate).not.toHaveBeenCalled()
        spoiler.destroy()
    })

    it("destroy removes the canvas", () => {
        let el = createFakeEl()
        let spoiler = createSpoiler(el as unknown as HTMLElement, { revealed: () => false })
        expect(el.children).toHaveLength(1)
        spoiler.destroy()
        expect(el.children).toHaveLength(0)
    })
})
