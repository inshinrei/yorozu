import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSharedElement, playSharedElement } from "./player"

type FakeNode = {
    tagName: string
    style: CSSStyleDeclaration
    children: FakeNode[]
    parentNode: FakeNode | null
    animate: ReturnType<typeof vi.fn>
    src: string
    alt: string
    draggable: boolean
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
        src: "",
        alt: "",
        draggable: false,
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

let animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }))

let from = { top: 10, left: 20, width: 40, height: 40 }
let to = { top: 100, left: 80, width: 200, height: 200 }

describe("createSharedElement", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }))
        vi.stubGlobal("document", {
            createElement: (tag: string) => createFakeEl(tag),
        })
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
        )
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("appends a clone to host", () => {
        let host = createFakeEl() as unknown as HTMLElement
        let se = createSharedElement()
        let playback = se.play({ host, from, to })
        expect(playback).not.toBeNull()
        expect((host as unknown as FakeNode).children).toHaveLength(1)
    })

    it("hides hideTarget then restores visibility", async () => {
        let host = createFakeEl() as unknown as HTMLElement
        let hideTarget = createFakeEl() as unknown as HTMLElement
        hideTarget.style.visibility = "visible"
        let se = createSharedElement()
        let playback = se.play({ host, from, to, hideTarget })
        expect(hideTarget.style.visibility).toBe("hidden")
        await vi.runAllTimersAsync()
        expect(await playback!.done).toBe(true)
        expect(hideTarget.style.visibility).toBe("visible")
    })

    it("second play cancels the first", async () => {
        let host = createFakeEl() as unknown as HTMLElement
        let se = createSharedElement()
        let first = se.play({ host, from, to })
        let second = se.play({ host, from, to })
        expect(await first!.done).toBe(false)
        expect(second).not.toBeNull()
        expect((host as unknown as FakeNode).children).toHaveLength(1)
    })

    it("playOpen with zero-size rects returns null", () => {
        let host = createFakeEl() as unknown as HTMLElement
        let se = createSharedElement()
        expect(
            se.playOpen({
                host,
                seed: { rect: { top: 0, left: 0, width: 0, height: 0 } },
            }),
        ).toBeNull()
    })

    it("cancel() removes the clone", async () => {
        let host = createFakeEl() as unknown as HTMLElement
        let se = createSharedElement()
        let playback = se.play({ host, from, to })
        expect((host as unknown as FakeNode).children).toHaveLength(1)
        se.cancel()
        expect((host as unknown as FakeNode).children).toHaveLength(0)
        expect(await playback!.done).toBe(false)
    })

    it("awaits onLand before removing the clone", async () => {
        let host = createFakeEl() as unknown as HTMLElement
        let hideTarget = createFakeEl() as unknown as HTMLElement
        let duringLand = { clones: 0, visibility: "" }
        let se = createSharedElement()
        let playback = se.play({
            host,
            from,
            to,
            hideTarget,
            onLand: () => {
                duringLand.clones = (host as unknown as FakeNode).children.length
                duringLand.visibility = hideTarget.style.visibility
            },
        })
        await vi.runAllTimersAsync()
        expect(await playback!.done).toBe(true)
        expect(duringLand.clones).toBe(1)
        expect(duringLand.visibility).toBe("hidden")
        expect((host as unknown as FakeNode).children).toHaveLength(0)
        expect(hideTarget.style.visibility).toBe("")
    })

    it("playClose with a null target fades out in place", async () => {
        let host = createFakeEl() as unknown as HTMLElement
        let se = createSharedElement()
        let playback = se.playClose({
            host,
            fromStage: to,
            target: null,
        })
        expect(playback).not.toBeNull()
        expect((host as unknown as FakeNode).children).toHaveLength(1)
        await vi.runAllTimersAsync()
        expect(await playback!.done).toBe(true)
        expect(animate).toHaveBeenCalled()
        let frames = animate.mock.calls[0]![0] as Keyframe[]
        expect(frames[1]!.opacity).toBe("0")
    })

    it("playClose with an off-viewport target lands off-viewport", () => {
        let host = createFakeEl() as unknown as HTMLElement
        let se = createSharedElement()
        let playback = se.playClose({
            host,
            fromStage: { top: 100, left: 10, width: 200, height: 100 },
            target: { rect: { top: -200, left: 10, width: 40, height: 40 } },
            viewport: { width: 400, height: 300 },
        })
        expect(playback).not.toBeNull()
        let clone = (host as unknown as FakeNode).children[0]!
        expect(clone.style.top).toBe("-40px")
    })
})

describe("playSharedElement", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }))
        vi.stubGlobal("document", {
            createElement: (tag: string) => createFakeEl(tag),
        })
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
        )
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("plays through a module-local controller", () => {
        let host = createFakeEl() as unknown as HTMLElement
        let playback = playSharedElement({ host, from, to })
        expect(playback).not.toBeNull()
        expect((host as unknown as FakeNode).children).toHaveLength(1)
    })
})
