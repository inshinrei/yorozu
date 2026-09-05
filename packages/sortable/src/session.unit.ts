// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { computeAutoScrollDelta, computeAutoScrollDeltaX } from "./auto-scroll-geometry"
import { HOLD_ACTIVATION, SORTABLE_FEEL } from "./feel"
import { createSortableSession, findScrollParent } from "./session"
import type { SortableAxis } from "./geometry"

function fakeEl(start: number, size: number, axis: SortableAxis = "y"): HTMLElement {
    let el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: axis === "y" ? start : 0,
        bottom: axis === "y" ? start + size : size,
        left: axis === "x" ? start : 0,
        right: axis === "x" ? start + size : size,
        width: axis === "x" ? size : 100,
        height: axis === "y" ? size : 40,
        x: axis === "x" ? start : 0,
        y: axis === "y" ? start : 0,
        toJSON: () => ({}),
    } as DOMRect)
    return el
}

function pointer(type: string, clientX: number, clientY: number, pointerId = 1): PointerEvent {
    return new PointerEvent(type, {
        clientX,
        clientY,
        bubbles: true,
        pointerId,
        button: 0,
        pointerType: "mouse",
    })
}

function moveTo(clientX: number, clientY: number): void {
    document.dispatchEvent(pointer("pointermove", clientX, clientY))
}

function upAt(clientX: number, clientY: number): void {
    document.dispatchEvent(pointer("pointerup", clientX, clientY))
}

function makeViewport(
    axis: SortableAxis,
    opts?: { start?: number; client?: number; scrollSize?: number; scroll?: number },
) {
    let start = opts?.start ?? 100
    let client = opts?.client ?? 160
    let scrollSize = opts?.scrollSize ?? 800
    let scroll = opts?.scroll ?? 0
    let vp = document.createElement("div")
    vi.spyOn(vp, "getBoundingClientRect").mockReturnValue({
        top: axis === "y" ? start : 0,
        bottom: axis === "y" ? start + client : 40,
        left: axis === "x" ? start : 0,
        right: axis === "x" ? start + client : 200,
        width: axis === "x" ? client : 200,
        height: axis === "y" ? client : 40,
        x: axis === "x" ? start : 0,
        y: axis === "y" ? start : 0,
        toJSON: () => ({}),
    } as DOMRect)
    if (axis === "y") {
        Object.defineProperty(vp, "clientHeight", { configurable: true, get: () => client })
        Object.defineProperty(vp, "scrollHeight", { configurable: true, get: () => scrollSize })
        Object.defineProperty(vp, "scrollTop", {
            configurable: true,
            get: () => scroll,
            set: (v: number) => {
                scroll = Math.max(0, Math.min(v, Math.max(0, scrollSize - client)))
            },
        })
    } else {
        Object.defineProperty(vp, "clientWidth", { configurable: true, get: () => client })
        Object.defineProperty(vp, "scrollWidth", { configurable: true, get: () => scrollSize })
        Object.defineProperty(vp, "scrollLeft", {
            configurable: true,
            get: () => scroll,
            set: (v: number) => {
                scroll = Math.max(0, Math.min(v, Math.max(0, scrollSize - client)))
            },
        })
    }
    return {
        vp,
        getScroll: () => scroll,
    }
}

function mockRaf() {
    let queued: FrameRequestCallback[] = []
    let orig = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        queued.push(cb)
        return queued.length
    }) as typeof requestAnimationFrame
    return {
        flush(n = 1) {
            for (let i = 0; i < n; i++) {
                let cb = queued.shift()
                if (cb) cb(performance.now())
            }
        },
        restore() {
            globalThis.requestAnimationFrame = orig
        },
    }
}

let sessions: Array<ReturnType<typeof createSortableSession<string>>> = []
let rafRestore: (() => void) | null = null

afterEach(() => {
    for (let s of sessions) s.cancel()
    sessions = []
    vi.useRealTimers()
    rafRestore?.()
    rafRestore = null
})

function setup(opts?: {
    items?: string[]
    axis?: SortableAxis
    activation?: typeof HOLD_ACTIVATION
    getItemSize?: () => number
    getViewport?: () => HTMLElement | null
    canDragKey?: (key: string | number) => boolean
    onDragEnd?: (reason: "pointerup" | "cancel") => void
    onReorder?: (items: string[]) => void
}) {
    let items = opts?.items ?? ["a", "b", "c"]
    let onReorder = vi.fn(opts?.onReorder)
    let session = createSortableSession({
        axis: opts?.axis ?? "y",
        getItems: () => items,
        getKey: (it) => it,
        onReorder,
        getItemSize: opts?.getItemSize,
        getViewport: opts?.getViewport,
        activation: opts?.activation,
        canDragKey: opts?.canDragKey,
        onDragEnd: opts?.onDragEnd,
    })
    sessions.push(session)
    return { session, onReorder, items }
}

function registerKeys(
    session: ReturnType<typeof createSortableSession<string>>,
    keys: string[],
    size = 40,
    axis: SortableAxis = "y",
) {
    return keys.map((key, i) => session.registerItem(fakeEl(i * size, size, axis), key))
}

describe("createSortableSession", () => {
    it("pointerDown + move below threshold stays inactive and does not reorder on up", () => {
        let { session, onReorder } = setup()
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 28)
        expect(session.isActive).toBe(false)
        expect(session.draggingKey).toBeNull()
        upAt(0, 28)
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("activate becomes active immediately without dispatching pointermove", () => {
        let { session } = setup()
        registerKeys(session, ["a", "b", "c"])
        let moves = 0
        let onMove = () => {
            moves += 1
        }
        document.addEventListener("pointermove", onMove)
        try {
            session.activate("a", 0, 20)
            expect(session.isActive).toBe(true)
            expect(session.draggingKey).toBe("a")
            expect(moves).toBe(0)
        } finally {
            document.removeEventListener("pointermove", onMove)
        }
    })

    it("pointerDown + move past moveThresholdPx along the axis activates and sets draggingKey", () => {
        let { session } = setup()
        registerKeys(session, ["a", "b", "c"])
        let ticks = 0
        session.subscribe(() => {
            ticks += 1
        })

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        expect(ticks).toBe(0)
        moveTo(0, 35)
        expect(session.isActive).toBe(true)
        expect(session.draggingKey).toBe("a")
        expect(session.liftScale).toBe(SORTABLE_FEEL.liftScale)
        expect(session.liftScale).toBe(1.05)
        expect(ticks).toBeGreaterThan(0)
    })

    it("onReorder receives moveItem of the full getItems() array including unregistered keys", () => {
        let { session, onReorder } = setup({ items: ["a", "b", "c", "d"], getItemSize: () => 40 })
        registerKeys(session, ["a", "b"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 150)
        upAt(0, 150)

        expect(onReorder).toHaveBeenCalledTimes(1)
        expect(onReorder.mock.calls[0]![0]).toEqual(["b", "c", "d", "a"])
    })

    it("destroy of a non-dragged registered node during an active drag does not cancel", () => {
        let { session } = setup()
        let regs = registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 35)
        expect(session.isActive).toBe(true)

        regs[1]!.destroy()
        expect(session.isActive).toBe(true)
        expect(session.draggingKey).toBe("a")
    })

    it("destroy of the dragged node does not cancel; pointerup still ends the gesture", () => {
        let { session, onReorder } = setup()
        let regs = registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 35)
        expect(session.isActive).toBe(true)

        regs[0]!.destroy()
        expect(session.isActive).toBe(true)
        expect(session.draggingKey).toBe("a")

        upAt(0, 35)
        expect(session.isActive).toBe(false)
        expect(session.draggingKey).toBeNull()
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("HOLD_ACTIVATION: move 5px before 200ms never activates", () => {
        vi.useFakeTimers()
        let { session, onReorder } = setup({ activation: HOLD_ACTIVATION })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 25)
        vi.advanceTimersByTime(200)
        expect(session.isActive).toBe(false)
        expect(session.draggingKey).toBeNull()

        moveTo(0, 50)
        expect(session.isActive).toBe(false)
        upAt(0, 50)
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("HOLD: cancel during delay never becomes active and does not reorder", () => {
        vi.useFakeTimers()
        let { session, onReorder } = setup({ activation: HOLD_ACTIVATION })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        expect(session.isActive).toBe(false)
        session.cancel()
        vi.advanceTimersByTime(200)
        expect(session.isActive).toBe(false)
        expect(session.draggingKey).toBeNull()

        moveTo(0, 100)
        upAt(0, 100)
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("HOLD: becomeActive re-checks canDragKey", () => {
        vi.useFakeTimers()
        let allow = true
        let { session, onReorder } = setup({
            activation: HOLD_ACTIVATION,
            canDragKey: () => allow,
        })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        allow = false
        vi.advanceTimersByTime(200)
        expect(session.isActive).toBe(false)
        expect(session.draggingKey).toBeNull()

        moveTo(0, 100)
        upAt(0, 100)
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("HOLD: becomeActive setPointerCapture on the pointerdown target", () => {
        vi.useFakeTimers()
        let { session } = setup({ activation: HOLD_ACTIVATION })
        registerKeys(session, ["a", "b", "c"])

        let target = document.createElement("div")
        document.body.appendChild(target)
        let capture = vi.fn()
        target.setPointerCapture = capture

        let ev = pointer("pointerdown", 0, 20)
        Object.defineProperty(ev, "target", { configurable: true, value: target })
        session.pointerDown("a", ev)
        expect(capture).not.toHaveBeenCalled()

        vi.advanceTimersByTime(200)
        expect(session.isActive).toBe(true)
        expect(capture).toHaveBeenCalledWith(1)

        target.remove()
    })

    it("getOffset follows pointer delta for the active key and shifts siblings by one item size", () => {
        let { session } = setup({ getItemSize: () => 40 })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 70)
        expect(session.isActive).toBe(true)
        expect(session.getOffset("a")).toBe(50)
        expect(session.getOffset("b")).toBe(-40)
        expect(session.getOffset("c")).toBe(0)
    })

    it("onDragEnd fires pointerup after drop and cancel only when a drag was active", () => {
        let onDragEnd = vi.fn()
        let { session } = setup({ onDragEnd })
        registerKeys(session, ["a", "b", "c"])
        session.pointerDown("a", pointer("pointerdown", 0, 20))
        upAt(0, 20)
        expect(onDragEnd).not.toHaveBeenCalled()

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 35)
        session.cancel()
        expect(onDragEnd).toHaveBeenCalledWith("cancel")

        onDragEnd.mockClear()
        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 35)
        upAt(0, 35)
        expect(onDragEnd).toHaveBeenCalledWith("pointerup")
    })

    it("onReorder throw still resets so a later pointerDown can activate", () => {
        let { session, onReorder } = setup({
            getItemSize: () => 40,
            onReorder: () => {
                throw new Error("reorder failed")
            },
        })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 150)
        let onWindowError = (ev: Event) => {
            ev.preventDefault()
        }
        window.addEventListener("error", onWindowError)
        try {
            upAt(0, 150)
        } catch {
            // host throw may surface from pointerup
        } finally {
            window.removeEventListener("error", onWindowError)
        }
        expect(onReorder).toHaveBeenCalledTimes(1)
        expect(session.isActive).toBe(false)
        expect(session.draggingKey).toBeNull()

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 35)
        expect(session.isActive).toBe(true)
        expect(session.draggingKey).toBe("a")
    })

    it("ignores pointermove and pointerup from a foreign pointerId", () => {
        let { session } = setup({ getItemSize: () => 40 })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 70)
        expect(session.isActive).toBe(true)
        let offsetA = session.getOffset("a")
        let insert = session.insertIndex
        expect(offsetA).toBe(50)
        expect(insert).not.toBeNull()

        document.dispatchEvent(pointer("pointermove", 0, 150, 2))
        expect(session.getOffset("a")).toBe(offsetA)
        expect(session.insertIndex).toBe(insert)

        document.dispatchEvent(pointer("pointerup", 0, 150, 2))
        expect(session.isActive).toBe(true)
        expect(session.draggingKey).toBe("a")
        expect(session.getOffset("a")).toBe(offsetA)

        upAt(0, 70)
        expect(session.isActive).toBe(false)
        expect(session.draggingKey).toBeNull()
    })
})

describe("createSortableSession auto-scroll", () => {
    it("Y: pointer in the 60px end zone changes scrollTop on rAF", () => {
        let { vp, getScroll } = makeViewport("y")
        let raf = mockRaf()
        rafRestore = raf.restore
        let { session } = setup({ getViewport: () => vp })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 250)

        let start = getScroll()
        raf.flush(5)
        expect(getScroll()).toBeGreaterThan(start)
    })

    it("X: pointer in the 60px end zone changes scrollLeft on rAF", () => {
        let { vp, getScroll } = makeViewport("x")
        let raf = mockRaf()
        rafRestore = raf.restore
        let { session } = setup({ axis: "x", getViewport: () => vp })
        registerKeys(session, ["a", "b", "c"], 40, "x")

        session.pointerDown("a", pointer("pointerdown", 20, 0))
        moveTo(250, 0)
        raf.flush(1)
        let expectedX = computeAutoScrollDeltaX(250, { left: 100, right: 260 }, 60, 18)
        expect(expectedX).toBeGreaterThan(0)
        expect(getScroll()).toBe(expectedX)
    })

    it("defaults to zone 60 and max step 18", () => {
        let { vp, getScroll } = makeViewport("y")
        let raf = mockRaf()
        rafRestore = raf.restore
        let { session } = setup({ getViewport: () => vp })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 180)
        raf.flush(3)
        expect(getScroll()).toBe(0)

        moveTo(0, 250)
        raf.flush(1)
        let expected = computeAutoScrollDelta(250, { top: 100, bottom: 260 }, 60, 18)
        expect(expected).toBeGreaterThan(0)
        expect(expected).toBeLessThanOrEqual(18)
        expect(getScroll()).toBe(expected)
    })

    it("after auto-scroll, getOverlayOffset is pointer delta only; getOffset includes scrollDelta", () => {
        let { vp, getScroll } = makeViewport("y")
        let raf = mockRaf()
        rafRestore = raf.restore
        let { session } = setup({ getViewport: () => vp, getItemSize: () => 40 })
        registerKeys(session, ["a", "b", "c"])

        session.pointerDown("a", pointer("pointerdown", 0, 20))
        moveTo(0, 250)
        expect(session.isActive).toBe(true)

        let pointerDelta = 230
        expect(session.getOverlayOffset()).toBe(pointerDelta)
        expect(session.getOffset("a")).toBe(pointerDelta)

        raf.flush(1)
        let scrolled = getScroll()
        expect(scrolled).toBeGreaterThan(0)
        expect(session.getOverlayOffset()).toBe(pointerDelta)
        expect(session.getOffset("a")).toBe(pointerDelta + scrolled)
        expect(session.getOffset("b")).toBe(-40)
    })
})

describe("findScrollParent", () => {
    it("returns null when there is no overflow ancestor", () => {
        let el = document.createElement("div")
        document.body.appendChild(el)
        expect(findScrollParent(el)).toBeNull()
        el.remove()
    })

    it("returns the nearest overflow ancestor when content overflows on Y", () => {
        let parent = document.createElement("div")
        let child = document.createElement("div")
        parent.appendChild(child)
        document.body.appendChild(parent)

        Object.defineProperty(parent, "scrollHeight", { configurable: true, get: () => 400 })
        Object.defineProperty(parent, "clientHeight", { configurable: true, get: () => 100 })
        vi.spyOn(globalThis, "getComputedStyle").mockImplementation((node) => {
            if (node === parent) {
                return { overflowY: "auto" } as CSSStyleDeclaration
            }
            return { overflowY: "visible" } as CSSStyleDeclaration
        })

        try {
            expect(findScrollParent(child)).toBe(parent)
        } finally {
            vi.restoreAllMocks()
            parent.remove()
        }
    })

    it("returns the nearest overflow ancestor when content overflows on X", () => {
        let parent = document.createElement("div")
        let child = document.createElement("div")
        parent.appendChild(child)
        document.body.appendChild(parent)

        Object.defineProperty(parent, "scrollWidth", { configurable: true, get: () => 400 })
        Object.defineProperty(parent, "clientWidth", { configurable: true, get: () => 100 })
        vi.spyOn(globalThis, "getComputedStyle").mockImplementation((node) => {
            if (node === parent) {
                return { overflowX: "auto" } as CSSStyleDeclaration
            }
            return { overflowX: "visible" } as CSSStyleDeclaration
        })

        try {
            expect(findScrollParent(child, "x")).toBe(parent)
        } finally {
            vi.restoreAllMocks()
            parent.remove()
        }
    })
})
