import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { playRipple, RIPPLE_MS } from "./ripple"

type FakeNode = {
    tagName: string
    style: CSSStyleDeclaration
    children: FakeNode[]
    parentNode: FakeNode | null
    animate: ReturnType<typeof vi.fn>
    setAttribute: ReturnType<typeof vi.fn>
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
        animate,
        setAttribute: vi.fn(),
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

let animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))

describe("playRipple", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
        vi.stubGlobal("document", {
            createElement: (tag: string) => createFakeEl(tag),
        })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("appends a circular ink at the host-relative point", async () => {
        expect(RIPPLE_MS).toBe(400)
        let host = createFakeEl() as unknown as HTMLElement
        let playback = playRipple(host, { x: 12, y: 24, color: "rgba(0, 0, 0, 0.2)" })
        let ink = (host as unknown as FakeNode).children[0]!
        expect(ink).toBeTruthy()
        expect(ink.style.getPropertyValue("position")).toBe("absolute")
        expect(ink.style.getPropertyValue("left")).toBe("12px")
        expect(ink.style.getPropertyValue("top")).toBe("24px")
        expect(ink.style.getPropertyValue("border-radius")).toBe("50%")
        expect(ink.style.getPropertyValue("background")).toBe("rgba(0, 0, 0, 0.2)")
        expect(ink.style.getPropertyValue("pointer-events")).toBe("none")
        let frames = animate.mock.calls[0]![0] as Keyframe[]
        let opts = animate.mock.calls[0]![1] as KeyframeAnimationOptions
        expect(frames).toEqual([
            { transform: "translate(-50%, -50%) scale(0)", opacity: "1" },
            { transform: "translate(-50%, -50%) scale(1)", opacity: "0" },
        ])
        expect(opts.duration).toBe(400)
        expect(await playback.done).toBe(true)
        expect((host as unknown as FakeNode).children).toHaveLength(0)
    })

    it("removes the ink when cancelled", async () => {
        let cancel = vi.fn()
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let host = createFakeEl() as unknown as HTMLElement
        let playback = playRipple(host, { x: 4, y: 8 })
        expect((host as unknown as FakeNode).children).toHaveLength(1)
        playback.cancel()
        expect(cancel).toHaveBeenCalled()
        expect((host as unknown as FakeNode).children).toHaveLength(0)
        expect(await playback.done).toBe(false)
    })
})
