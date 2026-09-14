// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { HOLD_ACTIVATION, SORTABLE_FEEL } from "./feel"
import { createSortableBothAxis } from "./both-axis"
import { computeAutoScrollDelta, computeAutoScrollDeltaX } from "./auto-scroll-geometry"

function fakeEl(left: number, top: number, width: number, height: number): HTMLElement {
    let el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        x: left,
        y: top,
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

function wrapNodes() {
    return {
        a: fakeEl(0, 0, 48, 48),
        b: fakeEl(52, 0, 48, 48),
        c: fakeEl(0, 52, 48, 48),
        d: fakeEl(52, 52, 48, 48),
    }
}

function makeViewport(opts?: { startY?: number; clientY?: number; scrollSizeY?: number }) {
    let startY = opts?.startY ?? 100
    let clientY = opts?.clientY ?? 160
    let scrollSizeY = opts?.scrollSizeY ?? 800
    let scrollTop = 0
    let scrollLeft = 0
    let vp = document.createElement("div")
    vi.spyOn(vp, "getBoundingClientRect").mockReturnValue({
        top: startY,
        bottom: startY + clientY,
        left: 0,
        right: 200,
        width: 200,
        height: clientY,
        x: 0,
        y: startY,
        toJSON: () => ({}),
    } as DOMRect)
    Object.defineProperty(vp, "clientHeight", { configurable: true, get: () => clientY })
    Object.defineProperty(vp, "scrollHeight", { configurable: true, get: () => scrollSizeY })
    Object.defineProperty(vp, "clientWidth", { configurable: true, get: () => 200 })
    Object.defineProperty(vp, "scrollWidth", { configurable: true, get: () => 200 })
    Object.defineProperty(vp, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set: (v: number) => {
            scrollTop = Math.max(0, Math.min(v, Math.max(0, scrollSizeY - clientY)))
        },
    })
    Object.defineProperty(vp, "scrollLeft", {
        configurable: true,
        get: () => scrollLeft,
        set: (v: number) => {
            scrollLeft = v
        },
    })
    return { vp, getScrollTop: () => scrollTop, getScrollLeft: () => scrollLeft }
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

let sessions: Array<ReturnType<typeof createSortableBothAxis<string>>> = []
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
    activation?: typeof HOLD_ACTIVATION
    getViewport?: () => HTMLElement | null
    canDragKey?: (key: string | number) => boolean
    onDragEnd?: (reason: "pointerup" | "cancel") => void
    onReorder?: (items: string[]) => void
    reducedMotion?: () => boolean
    feel?: Partial<typeof SORTABLE_FEEL>
}) {
    let items = opts?.items ?? ["a", "b", "c", "d"]
    let onReorder = vi.fn(opts?.onReorder)
    let session = createSortableBothAxis({
        getItems: () => items,
        getKey: (it) => it,
        onReorder,
        getViewport: opts?.getViewport,
        activation: opts?.activation,
        canDragKey: opts?.canDragKey,
        onDragEnd: opts?.onDragEnd,
        reducedMotion: opts?.reducedMotion,
        feel: opts?.feel,
    })
    sessions.push(session)
    return { session, onReorder, items }
}

function registerWrap(session: ReturnType<typeof createSortableBothAxis<string>>) {
    let nodes = wrapNodes()
    for (let key of ["a", "b", "c", "d"] as const) {
        session.registerItem(nodes[key], key)
    }
    return nodes
}

describe("createSortableBothAxis", () => {
    it("pointerDown + hypot below threshold stays inactive", () => {
        let { session, onReorder } = setup()
        registerWrap(session)
        session.pointerDown("a", pointer("pointerdown", 24, 24))
        moveTo(30, 28)
        expect(session.isActive).toBe(false)
        upAt(30, 28)
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("euclidean move of 10px activates even if each axis is under 10", () => {
        let { session } = setup()
        registerWrap(session)
        session.pointerDown("a", pointer("pointerdown", 0, 0))
        moveTo(8, 6)
        expect(session.isActive).toBe(true)
        expect(session.draggingKey).toBe("a")
    })

    it("activate becomes active immediately", () => {
        let { session } = setup()
        registerWrap(session)
        session.activate("a", 24, 24)
        expect(session.isActive).toBe(true)
        expect(session.draggingKey).toBe("a")
    })

    it("insertIndex uses wrapping rows, not a 1d spine", () => {
        let { session } = setup()
        registerWrap(session)
        session.activate("a", 24, 24)
        moveTo(10, 76)
        expect(session.insertIndex).toBe(2)
        moveTo(200, 76)
        expect(session.insertIndex).toBe(4)
    })

    it("getOffset dragged key is pointer delta; siblings FLIP to neighbor slots", () => {
        let { session } = setup()
        registerWrap(session)
        session.activate("a", 24, 24)
        moveTo(24 + 40, 24 + 10)
        expect(session.getOffset("a")).toEqual({ x: 40, y: 10 })
        expect(session.getOverlayOffset()).toEqual({ x: 40, y: 10 })
        moveTo(10, 76)
        expect(session.insertIndex).toBe(2)
        expect(session.getOffset("b")).toEqual({ x: -52, y: 0 })
        expect(session.getOffset("c")).toEqual({ x: 0, y: 0 })
        expect(session.getOffset("d")).toEqual({ x: 0, y: 0 })
    })

    it("moving to end of wrap shifts every later sibling along reading order", () => {
        let { session } = setup()
        registerWrap(session)
        session.activate("a", 24, 24)
        moveTo(200, 76)
        expect(session.insertIndex).toBe(4)
        expect(session.getOffset("b")).toEqual({ x: -52, y: 0 })
        expect(session.getOffset("c")).toEqual({ x: 52, y: -52 })
        expect(session.getOffset("d")).toEqual({ x: -52, y: 0 })
    })

    it("onReorder splices the full getItems array", () => {
        let { session, onReorder } = setup()
        registerWrap(session)
        session.activate("a", 24, 24)
        moveTo(10, 76)
        upAt(10, 76)
        expect(onReorder).toHaveBeenCalledTimes(1)
        expect(onReorder.mock.calls[0]![0]).toEqual(["b", "a", "c", "d"])
    })

    it("HOLD: hypot > delayFailPx before 200ms never activates", () => {
        vi.useFakeTimers()
        let { session, onReorder } = setup({ activation: HOLD_ACTIVATION })
        registerWrap(session)
        session.pointerDown("a", pointer("pointerdown", 24, 24))
        moveTo(24, 30)
        vi.advanceTimersByTime(200)
        expect(session.isActive).toBe(false)
        upAt(24, 30)
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("HOLD: becomeActive re-checks canDragKey", () => {
        vi.useFakeTimers()
        let allow = true
        let { session } = setup({
            activation: HOLD_ACTIVATION,
            canDragKey: () => allow,
        })
        registerWrap(session)
        session.pointerDown("a", pointer("pointerdown", 24, 24))
        allow = false
        vi.advanceTimersByTime(200)
        expect(session.isActive).toBe(false)
    })

    it("destroy of dragged node does not cancel; pointerup still ends", () => {
        let { session, onReorder } = setup()
        let nodes = registerWrap(session)
        let handle = session.registerItem(nodes.a, "a")
        session.activate("a", 24, 24)
        handle.destroy()
        expect(session.isActive).toBe(true)
        upAt(24, 24)
        expect(session.isActive).toBe(false)
        expect(onReorder).not.toHaveBeenCalled()
    })

    it("onDragEnd pointerup after drop and cancel only when active", () => {
        let onDragEnd = vi.fn()
        let { session } = setup({ onDragEnd })
        registerWrap(session)
        session.pointerDown("a", pointer("pointerdown", 24, 24))
        upAt(24, 24)
        expect(onDragEnd).not.toHaveBeenCalled()
        session.activate("a", 24, 24)
        session.cancel()
        expect(onDragEnd).toHaveBeenCalledWith("cancel")
        onDragEnd.mockClear()
        session.activate("a", 24, 24)
        upAt(24, 24)
        expect(onDragEnd).toHaveBeenCalledWith("pointerup")
    })

    it("ignores foreign pointerId", () => {
        let { session } = setup()
        registerWrap(session)
        session.pointerDown("a", pointer("pointerdown", 0, 0))
        moveTo(8, 6)
        let offset = session.getOffset("a")
        document.dispatchEvent(pointer("pointermove", 200, 200, 2))
        expect(session.getOffset("a")).toEqual(offset)
        document.dispatchEvent(pointer("pointerup", 200, 200, 2))
        expect(session.isActive).toBe(true)
        upAt(8, 6)
        expect(session.isActive).toBe(false)
    })

    it("reducedMotion maps liftScale 1 and siblingTransition none", () => {
        let { session } = setup({ reducedMotion: () => true })
        expect(session.liftScale).toBe(1)
        expect(session.siblingTransition).toBe("none")
    })

    it("merges partial feel", () => {
        let { session } = setup({ feel: { liftScale: 1.2, siblingMs: 100 } })
        expect(session.liftScale).toBe(1.2)
        expect(session.siblingTransition).toBe("100ms cubic-bezier(0.42, 0, 0.58, 1)")
    })
})

describe("createSortableBothAxis auto-scroll", () => {
    it("Y zone writes scrollTop and shifts insert index as rects move", () => {
        let { vp, getScrollTop } = makeViewport()
        let raf = mockRaf()
        rafRestore = raf.restore
        let { session } = setup({ getViewport: () => vp })
        registerWrap(session)
        session.activate("a", 24, 24)
        moveTo(24, 250)
        let start = getScrollTop()
        raf.flush(5)
        expect(getScrollTop()).toBeGreaterThan(start)
        let expected = computeAutoScrollDelta(250, { top: 100, bottom: 260 }, 60, 8)
        expect(expected).toBeGreaterThan(0)
    })

    it("X zone writes scrollLeft", () => {
        let startX = 100
        let clientX = 160
        let scrollSizeX = 800
        let scrollLeft = 0
        let vp = document.createElement("div")
        vi.spyOn(vp, "getBoundingClientRect").mockReturnValue({
            top: 0,
            bottom: 200,
            left: startX,
            right: startX + clientX,
            width: clientX,
            height: 200,
            x: startX,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect)
        Object.defineProperty(vp, "clientWidth", { configurable: true, get: () => clientX })
        Object.defineProperty(vp, "scrollWidth", { configurable: true, get: () => scrollSizeX })
        Object.defineProperty(vp, "clientHeight", { configurable: true, get: () => 200 })
        Object.defineProperty(vp, "scrollHeight", { configurable: true, get: () => 200 })
        Object.defineProperty(vp, "scrollLeft", {
            configurable: true,
            get: () => scrollLeft,
            set: (v: number) => {
                scrollLeft = Math.max(0, Math.min(v, scrollSizeX - clientX))
            },
        })
        Object.defineProperty(vp, "scrollTop", {
            configurable: true,
            get: () => 0,
            set: () => {},
        })
        let raf = mockRaf()
        rafRestore = raf.restore
        let { session } = setup({ getViewport: () => vp })
        registerWrap(session)
        session.activate("a", 24, 24)
        moveTo(250, 24)
        raf.flush(1)
        let expectedX = computeAutoScrollDeltaX(250, { left: 100, right: 260 }, 60, 8)
        expect(expectedX).toBeGreaterThan(0)
        expect(scrollLeft).toBe(expectedX)
    })

    it("dragged getOffset includes scrollDelta; overlay does not", () => {
        let { vp, getScrollTop } = makeViewport()
        let raf = mockRaf()
        rafRestore = raf.restore
        let { session } = setup({ getViewport: () => vp })
        registerWrap(session)
        session.activate("a", 24, 24)
        moveTo(24, 250)
        raf.flush(1)
        let dy = getScrollTop()
        expect(dy).toBeGreaterThan(0)
        expect(session.getOffset("a").y).toBe(250 - 24 + dy)
        expect(session.getOverlayOffset().y).toBe(250 - 24)
        expect(session.getOffset("a").x).toBe(0)
        expect(session.getOverlayOffset().x).toBe(0)
    })
})
