import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeAnimate } from "../_test/fake-animate"
import { computeFlight } from "../shared-element/math"
import { playSendFlight } from "./flight"

type FakeNode = {
    tagName: string
    style: CSSStyleDeclaration
    children: FakeNode[]
    parentNode: FakeNode | null
    animate: ReturnType<typeof createFakeAnimate>
    src: string
    cloneNode: (deep?: boolean) => FakeNode
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
        setAttribute: vi.fn(),
        cloneNode() {
            return createFakeEl(tag)
        },
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

let from = { top: 10, left: 20, width: 40, height: 40 }
let to = { top: 100, left: 80, width: 200, height: 200 }

describe("playSendFlight", () => {
    beforeEach(() => {
        animate = createFakeAnimate()
        vi.stubGlobal("document", {
            createElement: (tag: string) => createFakeEl(tag),
        })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("returns null when rects are invalid", () => {
        let host = createFakeEl() as unknown as HTMLElement
        expect(
            playSendFlight({
                host,
                from: { top: 0, left: 0, width: 0, height: 40 },
                to,
                imageUrl: "x.png",
            }),
        ).toBeNull()
        expect(
            playSendFlight({
                host,
                from,
                to: { top: 0, left: 0, width: 10, height: 0 },
                imageUrl: "x.png",
            }),
        ).toBeNull()
        expect((host as unknown as FakeNode).children).toHaveLength(0)
    })

    it("clones node when provided and flies with computeFlight", () => {
        let host = createFakeEl() as unknown as HTMLElement
        let node = createFakeEl("span") as unknown as HTMLElement
        let playback = playSendFlight({ host, from, to, node, imageUrl: "ignored.png" })
        expect(playback).not.toBeNull()
        let kids = (host as unknown as FakeNode).children
        expect(kids).toHaveLength(1)
        expect(kids[0]!.tagName).toBe("SPAN")
        let flight = computeFlight(from, to)!
        let frames = animate.mock.calls[0]![0]
        expect(frames[0]).toMatchObject({
            transform: `translate3d(${flight.fromTranslateX}px, ${flight.fromTranslateY}px, 0) scale(${flight.fromScaleX}, ${flight.fromScaleY})`,
        })
        expect(frames[1]).toMatchObject({
            transform: "translate3d(0, 0, 0) scale(1, 1)",
        })
    })

    it("creates an image clone when no node is given", () => {
        let host = createFakeEl() as unknown as HTMLElement
        playSendFlight({ host, from, to, imageUrl: "photo.png" })
        let clone = (host as unknown as FakeNode).children[0]!
        expect(clone.tagName).toBe("IMG")
        expect(clone.src).toBe("photo.png")
    })

    it("removes the clone when cancelled", async () => {
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
            finished: new Promise<void>(() => undefined),
            cancel,
        }))
        let host = createFakeEl() as unknown as HTMLElement
        let playback = playSendFlight({ host, from, to, imageUrl: "x.png" })
        expect((host as unknown as FakeNode).children).toHaveLength(1)
        playback!.cancel()
        expect(cancel).toHaveBeenCalled()
        expect((host as unknown as FakeNode).children).toHaveLength(0)
        expect(await playback!.done).toBe(false)
    })

    it("removes the clone on settle", async () => {
        let host = createFakeEl() as unknown as HTMLElement
        let playback = playSendFlight({ host, from, to, imageUrl: "x.png" })
        expect(await playback!.done).toBe(true)
        expect((host as unknown as FakeNode).children).toHaveLength(0)
    })
})
