// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { computeAutoScrollDelta, computeAutoScrollDeltaX } from "./auto-scroll-geometry"
import { AUTO_SCROLL_MAX_PX_PER_FRAME, AUTO_SCROLL_ZONE_PX, createSortableAutoScroll } from "./auto-scroll"
import type { SortableAxis } from "./geometry"

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
        setScrollSize: (next: number) => {
            scrollSize = next
        },
    }
}

function mockRaf() {
    let queued: FrameRequestCallback[] = []
    let orig = globalThis.requestAnimationFrame
    let origCancel = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        queued.push(cb)
        return queued.length
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
        queued[id - 1] = undefined as unknown as FrameRequestCallback
    }) as typeof cancelAnimationFrame
    return {
        flush(n = 1) {
            for (let i = 0; i < n; i++) {
                let cb = queued.shift()
                if (cb) cb(performance.now())
            }
        },
        queuedCount: () => queued.filter(Boolean).length,
        restore() {
            globalThis.requestAnimationFrame = orig
            globalThis.cancelAnimationFrame = origCancel
        },
    }
}

let rafRestore: (() => void) | null = null
afterEach(() => {
    rafRestore?.()
    rafRestore = null
})

describe("createSortableAutoScroll", () => {
    it("exports default zone 60 and max step 8", () => {
        expect(AUTO_SCROLL_ZONE_PX).toBe(60)
        expect(AUTO_SCROLL_MAX_PX_PER_FRAME).toBe(8)
    })

    it("Y: writes scrollTop on rAF using the default max step", () => {
        let { vp, getScroll } = makeViewport("y")
        let raf = mockRaf()
        rafRestore = raf.restore
        let onScrolled = vi.fn()
        let loop = createSortableAutoScroll({
            axis: "y",
            zone: AUTO_SCROLL_ZONE_PX,
            maxStep: AUTO_SCROLL_MAX_PX_PER_FRAME,
            getPointer: () => 250,
            isDragging: () => true,
            onScrolled,
        })
        loop.begin(vp)
        loop.kick()
        raf.flush(1)
        let expected = computeAutoScrollDelta(250, { top: 100, bottom: 260 }, 60, 8)
        expect(expected).toBeGreaterThan(0)
        expect(expected).toBeLessThanOrEqual(8)
        expect(getScroll()).toBe(expected)
        expect(onScrolled).toHaveBeenCalledWith(expected)
        expect(loop.scrollDelta).toBe(expected)
    })

    it("X: writes scrollLeft on rAF", () => {
        let { vp, getScroll } = makeViewport("x")
        let raf = mockRaf()
        rafRestore = raf.restore
        let loop = createSortableAutoScroll({
            axis: "x",
            zone: 60,
            maxStep: 8,
            getPointer: () => 250,
            isDragging: () => true,
            onScrolled: () => {},
        })
        loop.begin(vp)
        loop.kick()
        raf.flush(1)
        let expected = computeAutoScrollDeltaX(250, { left: 100, right: 260 }, 60, 8)
        expect(getScroll()).toBe(expected)
    })

    it("freezes scroll-max at begin; later scrollHeight growth cannot extend the range", () => {
        let { vp, getScroll, setScrollSize } = makeViewport("y", { client: 100, scrollSize: 200, start: 0 })
        let raf = mockRaf()
        rafRestore = raf.restore
        let pointer = 90
        let loop = createSortableAutoScroll({
            axis: "y",
            zone: 60,
            maxStep: 8,
            getPointer: () => pointer,
            isDragging: () => true,
            onScrolled: () => {},
        })
        loop.begin(vp)
        setScrollSize(5000)
        loop.kick()
        raf.flush(40)
        expect(getScroll()).toBeLessThanOrEqual(100)
        expect(getScroll()).toBeGreaterThan(0)
    })

    it("kick no-ops when not dragging, when viewport is missing, or when delta is 0", () => {
        let { vp } = makeViewport("y")
        let raf = mockRaf()
        rafRestore = raf.restore
        let dragging = false
        let pointer = 180
        let loop = createSortableAutoScroll({
            axis: "y",
            zone: 60,
            maxStep: 8,
            getPointer: () => pointer,
            isDragging: () => dragging,
            onScrolled: () => {},
        })
        loop.kick()
        expect(raf.queuedCount()).toBe(0)
        dragging = true
        loop.kick()
        expect(raf.queuedCount()).toBe(0)
        loop.begin(vp)
        loop.kick()
        expect(raf.queuedCount()).toBe(0)
        pointer = 250
        loop.kick()
        expect(raf.queuedCount()).toBe(1)
    })

    it("still accepts maxStep 18 when the host passes it", () => {
        let { vp, getScroll } = makeViewport("y")
        let raf = mockRaf()
        rafRestore = raf.restore
        let loop = createSortableAutoScroll({
            axis: "y",
            zone: 60,
            maxStep: 18,
            getPointer: () => 250,
            isDragging: () => true,
            onScrolled: () => {},
        })
        loop.begin(vp)
        loop.kick()
        raf.flush(1)
        let expected = computeAutoScrollDelta(250, { top: 100, bottom: 260 }, 60, 18)
        expect(expected).toBeGreaterThan(8)
        expect(getScroll()).toBe(expected)
    })

    it("calls onAutoScroll with applied delta and viewport after a write", () => {
        let { vp, getScroll } = makeViewport("y")
        let raf = mockRaf()
        rafRestore = raf.restore
        let onAutoScroll = vi.fn()
        let loop = createSortableAutoScroll({
            axis: "y",
            zone: 60,
            maxStep: 8,
            getPointer: () => 250,
            isDragging: () => true,
            onScrolled: () => {},
            onAutoScroll,
        })
        loop.begin(vp)
        loop.kick()
        raf.flush(1)
        let applied = getScroll()
        expect(applied).toBeGreaterThan(0)
        expect(onAutoScroll).toHaveBeenCalledTimes(1)
        expect(onAutoScroll).toHaveBeenCalledWith(applied, vp)
    })

    it("does not call onAutoScroll when clamp blocks the write", () => {
        let { vp } = makeViewport("y", { client: 100, scrollSize: 100, start: 0, scroll: 0 })
        let raf = mockRaf()
        rafRestore = raf.restore
        let onAutoScroll = vi.fn()
        let loop = createSortableAutoScroll({
            axis: "y",
            zone: 60,
            maxStep: 8,
            getPointer: () => 90,
            isDragging: () => true,
            onScrolled: () => {},
            onAutoScroll,
        })
        loop.begin(vp)
        loop.kick()
        raf.flush(3)
        expect(onAutoScroll).not.toHaveBeenCalled()
    })
})
