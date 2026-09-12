// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { createSortableSession } from "./session"
import { paintSortableTransforms } from "./paint"

function fakeEl(): HTMLElement {
    return document.createElement("div")
}

function pointer(clientY: number): PointerEvent {
    return new PointerEvent("pointerdown", {
        clientX: 0,
        clientY,
        bubbles: true,
        pointerId: 1,
        button: 0,
        pointerType: "mouse",
    })
}

let sessions: Array<ReturnType<typeof createSortableSession<string>>> = []
afterEach(() => {
    for (let s of sessions) s.cancel()
    sessions = []
})

function makeSession(axis: "x" | "y" = "y") {
    let items = ["a", "b", "c"]
    let session = createSortableSession({
        axis,
        getItems: () => items,
        getKey: (it) => it,
        getItemSize: () => 40,
    })
    sessions.push(session)
    let nodes = new Map<string, HTMLElement>()
    for (let key of items) {
        let el = fakeEl()
        session.registerItem(el, key)
        nodes.set(key, el)
    }
    return { session, nodes }
}

describe("paintSortableTransforms", () => {
    it("writes only transform and transition; dragging key is scaled and has transition none", () => {
        let { session, nodes } = makeSession("y")
        session.pointerDown("a", pointer(20))
        document.dispatchEvent(
            new PointerEvent("pointermove", { clientX: 0, clientY: 60, bubbles: true, pointerId: 1 }),
        )
        paintSortableTransforms(session, nodes)
        let a = nodes.get("a")!
        let b = nodes.get("b")!
        expect(a.style.transform).toMatch(/translate3d\(0px, .+px, 0px\) scale\(1\.05\)/)
        expect(a.style.transition).toBe("none")
        expect(b.style.transform).toMatch(/translate3d\(0px, .+px, 0px\) scale\(1\)/)
        expect(b.style.transition).toBe(session.siblingTransition)
        expect(a.style.top).toBe("")
        expect(a.style.left).toBe("")
        expect(a.style.width).toBe("")
        expect(a.style.height).toBe("")
    })

    it("axis x uses translate3d(offset, 0, 0)", () => {
        let { session, nodes } = makeSession("x")
        session.activate("a", 20, 0)
        document.dispatchEvent(
            new PointerEvent("pointermove", { clientX: 60, clientY: 0, bubbles: true, pointerId: 1 }),
        )
        paintSortableTransforms(session, nodes)
        expect(nodes.get("a")!.style.transform).toMatch(/translate3d\(.+px, 0px, 0px\) scale\(1\.05\)/)
    })

    it("opts.reduced forces scale 1 and transition none on every node", () => {
        let { session, nodes } = makeSession("y")
        session.activate("a", 0, 20)
        paintSortableTransforms(session, nodes, { reduced: true })
        for (let el of nodes.values()) {
            expect(el.style.transform).toMatch(/scale\(1\)/)
            expect(el.style.transition).toBe("none")
        }
    })

    it("does not paint keys omitted from the host map", () => {
        let { session, nodes } = makeSession("y")
        session.activate("a", 0, 20)
        let onlyA = new Map<string, HTMLElement>([["a", nodes.get("a")!]])
        let b = nodes.get("b")!
        b.style.transform = "none"
        paintSortableTransforms(session, onlyA)
        expect(b.style.transform).toBe("none")
        expect(nodes.get("a")!.style.transform).not.toBe("")
    })
})
