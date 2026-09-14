// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSortableBothAxis } from "./both-axis"
import { paintSortableFlowTransforms } from "./paint-flow"

function fakeEl(left: number, top: number): HTMLElement {
    let el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        left,
        top,
        right: left + 48,
        bottom: top + 48,
        width: 48,
        height: 48,
        x: left,
        y: top,
        toJSON: () => ({}),
    } as DOMRect)
    return el
}

let sessions: Array<ReturnType<typeof createSortableBothAxis<string>>> = []
afterEach(() => {
    for (let s of sessions) s.cancel()
    sessions = []
})

function makeSession() {
    let items = ["a", "b", "c", "d"]
    let session = createSortableBothAxis({
        getItems: () => items,
        getKey: (it) => it,
    })
    sessions.push(session)
    let nodes = new Map<string, HTMLElement>()
    let layout = [
        ["a", 0, 0],
        ["b", 52, 0],
        ["c", 0, 52],
        ["d", 52, 52],
    ] as const
    for (let [key, left, top] of layout) {
        let el = fakeEl(left, top)
        session.registerItem(el, key)
        nodes.set(key, el)
    }
    return { session, nodes }
}

describe("paintSortableFlowTransforms", () => {
    it("writes translate3d(x, y) and scales the dragging key", () => {
        let { session, nodes } = makeSession()
        session.activate("a", 24, 24)
        document.dispatchEvent(
            new PointerEvent("pointermove", { clientX: 64, clientY: 34, bubbles: true, pointerId: 1 }),
        )
        paintSortableFlowTransforms(session, nodes)
        let a = nodes.get("a")!
        expect(a.style.transform).toMatch(/translate3d\(40px, 10px, 0px\) scale\(1\.05\)/)
        expect(a.style.transition).toBe("none")
        expect(nodes.get("b")!.style.transform).toMatch(/translate3d\(.+px, .+px, 0px\) scale\(1\)/)
        expect(nodes.get("b")!.style.transition).toBe(session.siblingTransition)
        expect(a.style.top).toBe("")
        expect(a.style.left).toBe("")
    })

    it("opts.reduced forces scale 1 and transition none", () => {
        let { session, nodes } = makeSession()
        session.activate("a", 24, 24)
        paintSortableFlowTransforms(session, nodes, { reduced: true })
        for (let el of nodes.values()) {
            expect(el.style.transform).toMatch(/scale\(1\)/)
            expect(el.style.transition).toBe("none")
        }
    })

    it("does not paint keys omitted from the host map", () => {
        let { session, nodes } = makeSession()
        session.activate("a", 24, 24)
        let b = nodes.get("b")!
        b.style.transform = "none"
        paintSortableFlowTransforms(session, new Map([["a", nodes.get("a")!]]))
        expect(b.style.transform).toBe("none")
    })
})
