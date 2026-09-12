import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_IDLE_TRIM_MS, DEFAULT_LIST_SLICE } from "./index"
import { createVirtualList } from "./list"

function ids(n: number): string[] {
    return Array.from({ length: n }, (_, i) => `c${i}`)
}

describe("createVirtualList", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("windows from the top and reports arithmetic geometry", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 48,
            listSlice: 5,
        })
        expect(list.sync()).toBe(true)
        expect(list.viewportIds()).toEqual(["c0", "c1", "c2", "c3", "c4"])
        expect(list.fromOffset()).toBe(0)
        expect(list.totalSize()).toBe(4800)
        expect(list.rowTop(10)).toBe(480)
        expect(list.rowHeight(3)).toBe(48)
        list.destroy()
    })

    it("rebuilds prefix on sync and uses it for rowTop / first-visible reanchor", () => {
        let items = ids(8)
        let heights = [10, 50, 20, 80, 10, 50, 20, 80]
        let list = createVirtualList({
            getItems: () => items,
            itemSize: (i) => heights[i] ?? 0,
            listSlice: 3,
        })
        list.sync()
        expect(list.totalSize()).toBe(320)
        expect(list.rowTop(2)).toBe(60)
        expect(list.rowHeight(1)).toBe(50)
        list.onScroll({ scrollTop: 200, viewportHeight: 40 })
        expect(list.viewportIds()?.includes("c5") || list.viewportIds()?.includes("c4")).toBe(true)
        list.destroy()
    })

    it("does not re-slice on scroll when the first visible stays inside the window", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            listSlice: 5,
        })
        list.sync()
        let first = list.viewportIds()
        list.onScroll({ scrollTop: 40, viewportHeight: 80 })
        expect(list.viewportIds()).toBe(first)
        list.destroy()
    })

    it("onScroll does not copy the spine when first-visible stays inside the window", () => {
        let items: readonly string[] = ids(100)
        let slice = vi.spyOn(items as string[], "slice")
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            listSlice: 5,
        })
        list.sync()
        slice.mockClear()
        list.onScroll({ scrollTop: 40, viewportHeight: 80 })
        expect(slice).not.toHaveBeenCalled()
        expect(list.viewportIds()).toEqual(["c0", "c1", "c2", "c3", "c4"])
        list.getMore("backwards")
        expect(slice).toHaveBeenCalled()
        slice.mockClear()
        list.onScroll({ scrollTop: 40 * 80, viewportHeight: 200 })
        expect(slice).toHaveBeenCalled()
        expect(list.viewportIds()?.includes("c80")).toBe(true)
        list.destroy()
    })

    it("expands backwards when scrolling toward the mounted bottom", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 72,
            listSlice: 5,
            sensitiveArea: 800,
        })
        list.sync()
        list.onScroll({ scrollTop: 0, viewportHeight: 300 })
        list.onScroll({ scrollTop: 200, viewportHeight: 300 })
        expect((list.viewportIds()?.length ?? 0) > 5).toBe(true)
        expect(list.viewportIds()?.[0]).toBe("c0")
        list.destroy()
    })

    it("reanchors when the scrollbar jumps past the mounted window", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            listSlice: 5,
        })
        list.sync()
        list.onScroll({ scrollTop: 40 * 80, viewportHeight: 200 })
        expect(list.viewportIds()?.includes("c80")).toBe(true)
        expect(list.fromOffset()).toBeGreaterThan(0)
        list.destroy()
    })

    it("fires onPaintedRange from onScroll (mounted window is larger than painted)", () => {
        let items = ids(100)
        let painted: Array<{ start: number; end: number }> = []
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 48,
            listSlice: 30,
            onPaintedRange: (r) => painted.push(r),
        })
        list.sync()
        list.onScroll({ scrollTop: 0, viewportHeight: 240 })
        expect(painted.at(-1)).toEqual({ start: 0, end: 5 })
        expect((list.viewportIds()?.length ?? 0) >= 5).toBe(true)
        list.destroy()
    })

    it("fires onVisibleRange for the mounted window", () => {
        let items = ids(100)
        let visible: Array<{ start: number; end: number }> = []
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            listSlice: 5,
            onVisibleRange: (r) => visible.push(r),
        })
        list.sync()
        expect(visible.at(-1)).toEqual({ start: 0, end: 5 })
        list.destroy()
    })

    it("keeps slot numbers for ids that stay mounted", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            listSlice: 5,
        })
        list.sync()
        let slot0 = list.slotIndex("c0")
        let slot4 = list.slotIndex("c4")
        expect(slot0).toBeTypeOf("number")
        list.getMore("backwards")
        expect(list.slotIndex("c0")).toBe(slot0)
        expect(list.slotIndex("c4")).toBe(slot4)
        expect(list.slotIndex("c9")).toBeTypeOf("number")
        expect(list.slotIndex("c9")).not.toBe(slot0)
        list.destroy()
    })

    it("trims on idle and applies listSliceForViewport then", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 72,
            listSlice: 5,
            sensitiveArea: 800,
        })
        list.sync()
        list.onScroll({ scrollTop: 0, viewportHeight: 300 })
        list.onScroll({ scrollTop: 400, viewportHeight: 300 })
        list.onScroll({ scrollTop: 800, viewportHeight: 300 })
        expect((list.viewportIds()?.length ?? 0) >= 10).toBe(true)
        vi.advanceTimersByTime(DEFAULT_IDLE_TRIM_MS)
        expect((list.viewportIds()?.length ?? 0) <= 32).toBe(true)
        expect(list.viewportIds()?.length).toBeGreaterThan(0)
        list.destroy()
    })

    it("does not change listSlice during the fling (only on idle)", () => {
        let items = ids(100)
        let slices: number[] = []
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            listSlice: DEFAULT_LIST_SLICE,
            onVisibleRange: (r) => slices.push(r.end - r.start),
        })
        list.sync()
        let mountedBeforeIdle = list.viewportIds()?.length
        list.onScroll({ scrollTop: 0, viewportHeight: 2000 })
        expect(list.viewportIds()?.length).toBe(mountedBeforeIdle)
        vi.advanceTimersByTime(DEFAULT_IDLE_TRIM_MS)
        expect((list.viewportIds()?.length ?? 0) <= 48).toBe(true)
        list.destroy()
    })

    it("forwards getFromTranslateY and does not use it as rowTop", () => {
        let items = ids(10)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            getFromTranslateY: (key) => (key === "c1" ? -80 : undefined),
        })
        list.sync()
        expect(list.fromTranslateY("c1")).toBe(-80)
        expect(list.rowTop(1)).toBe(40)
        list.destroy()
    })

    it("sync of equal content does not collapse an expanded window", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 40,
            listSlice: 5,
        })
        list.sync()
        list.getMore("backwards")
        let expanded = [...(list.viewportIds() ?? [])]
        items = [...items]
        expect(list.sync()).toBe(false)
        expect(list.viewportIds()).toEqual(expanded)
        list.destroy()
    })

    it("destroy cancels a pending idle trim", () => {
        let items = ids(100)
        let list = createVirtualList({
            getItems: () => items,
            itemSize: 72,
            listSlice: 5,
            sensitiveArea: 800,
        })
        list.sync()
        list.onScroll({ scrollTop: 0, viewportHeight: 300 })
        list.onScroll({ scrollTop: 400, viewportHeight: 300 })
        list.destroy()
        let after = [...(list.viewportIds() ?? [])]
        vi.advanceTimersByTime(DEFAULT_IDLE_TRIM_MS)
        expect(list.viewportIds()).toEqual(after)
    })
})
