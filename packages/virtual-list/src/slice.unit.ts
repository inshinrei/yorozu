import { describe, expect, it, vi } from "vitest"
import {
    areIdArraysEqual,
    DEFAULT_LIST_SLICE,
    getViewportSlice,
    reuseIfEqual,
    ViewportIdSliceController,
} from "./slice"

describe("getViewportSlice", () => {
    let ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]

    it("forwards from first id covers start of list", () => {
        let r = getViewportSlice(ids, "forwards", 3, "a")
        expect(r.viewportIds).toEqual(["a", "b", "c"])
        expect(r.fromOffset).toBe(0)
        expect(r.isOnTop).toBe(true)
        expect(r.areSomeLocal).toBe(true)
        expect(r.areAllLocal).toBe(true)
    })

    it("forwards from middle includes listSlice before and after offset", () => {
        let r = getViewportSlice(ids, "forwards", 3, "e")
        expect(r.viewportIds).toEqual(["b", "c", "d", "e", "f", "g"])
        expect(r.fromOffset).toBe(1)
        expect(r.isOnTop).toBe(false)
    })

    it("backwards from last id covers end of list", () => {
        let r = getViewportSlice(ids, "backwards", 3, "j")
        expect(r.viewportIds).toEqual(["h", "i", "j"])
        expect(r.fromOffset).toBe(7)
        expect(r.areAllLocal).toBe(false)
        expect(r.areSomeLocal).toBe(false)
    })

    it("backwards mid list expands toward the end", () => {
        let r = getViewportSlice(ids, "backwards", 2, "d")
        expect(r.viewportIds).toEqual(["c", "d", "e", "f"])
        expect(r.fromOffset).toBe(2)
    })

    it("missing offsetId defaults to index 0 for forwards", () => {
        let r = getViewportSlice(ids, "forwards", 2)
        expect(r.viewportIds).toEqual(["a", "b"])
        expect(r.fromOffset).toBe(0)
    })

    it("unknown offset for backwards anchors at length", () => {
        let r = getViewportSlice(ids, "backwards", 2, "missing")
        expect(r.viewportIds).toEqual(["i", "j"])
        expect(r.fromOffset).toBe(8)
    })
})

describe("areIdArraysEqual", () => {
    it("compares length and pairwise equality", () => {
        expect(areIdArraysEqual(["a", "b"], ["a", "b"])).toBe(true)
        expect(areIdArraysEqual(["a", "b"], ["a", "c"])).toBe(false)
        expect(areIdArraysEqual(["a"], ["a", "b"])).toBe(false)
        expect(areIdArraysEqual(undefined, undefined)).toBe(true)
        expect(areIdArraysEqual(["a"], undefined)).toBe(false)
    })
})

describe("reuseIfEqual", () => {
    it("returns the previous array when content matches", () => {
        let a = ["x", "y"]
        expect(reuseIfEqual(a, ["x", "y"])).toBe(a)
        expect(reuseIfEqual(a, ["x", "z"])).toEqual(["x", "z"])
        expect(reuseIfEqual(undefined, ["x"])).toEqual(["x"])
    })
})

describe("ViewportIdSliceController", () => {
    let full = Array.from({ length: 100 }, (_, i) => `c${i}`)

    it("initial sync windows from the top", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        expect(c.sync(full)).toBe(true)
        expect(c.fromOffset).toBe(0)
        expect(c.viewportIds?.length).toBe(5)
        expect(c.viewportIds?.[0]).toBe("c0")
        expect(c.isOnTop).toBe(true)
    })

    it("getMore backwards expands toward the end", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        let firstWindow = [...(c.viewportIds ?? [])]
        expect(c.getMore(full, { direction: "backwards" })).toBe(true)
        expect(c.viewportIds).not.toEqual(firstWindow)
        let last = c.viewportIds![c.viewportIds!.length - 1]
        expect(full.indexOf(last)).toBeGreaterThan(full.indexOf(firstWindow[firstWindow.length - 1]!))
    })

    it("getMore forwards from a mid window moves toward the start", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        for (let i = 0; i < 6; i++) c.getMore(full, { direction: "backwards" })
        expect(c.fromOffset).toBeGreaterThan(0)
        let midOffset = c.fromOffset
        c.getMore(full, { direction: "forwards" })
        expect(c.fromOffset).toBeLessThanOrEqual(midOffset)
    })

    it("sync on reordered source re-anchors around middle when not on top", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        for (let i = 0; i < 8; i++) c.getMore(full, { direction: "backwards" })
        let mid = c.viewportIds![Math.round(c.viewportIds!.length / 2)]
        let reordered = [...full.slice(1), full[0]!]
        c.sync(reordered)
        expect(c.viewportIds?.includes(mid!)).toBe(true)
    })

    it("sync ignores new array identity when content equal (no collapse)", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        for (let i = 0; i < 6; i++) c.getMore(full, { direction: "backwards" })
        let before = [...(c.viewportIds ?? [])]
        expect(before.length).toBeGreaterThan(5)
        expect(c.sync([...full])).toBe(false)
        expect(c.viewportIds).toEqual(before)
    })

    it("sync does not collapse expanded isOnTop window on real reorder near head", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        c.getMore(full, { direction: "backwards" })
        expect(c.isOnTop).toBe(true)
        let expanded = [...(c.viewportIds ?? [])]
        expect(expanded.length).toBeGreaterThan(5)
        let mid = expanded[Math.round(expanded.length / 2)]!
        let reordered = full.slice()
        let a = reordered[20]!
        reordered[20] = reordered[21]!
        reordered[21] = a
        c.sync(reordered)
        expect(c.viewportIds?.includes(mid)).toBe(true)
        expect((c.viewportIds?.length ?? 0) >= 5).toBe(true)
    })

    it("disabled exposes full source", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full, true)
        expect(c.viewportIds).toEqual(full)
        expect(c.fromOffset).toBe(0)
    })

    it("resetToTop restores start window", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 4 })
        c.sync(full)
        for (let i = 0; i < 10; i++) c.getMore(full, { direction: "backwards" })
        expect(c.fromOffset).toBeGreaterThan(0)
        c.resetToTop(full)
        expect(c.fromOffset).toBe(0)
        expect(c.viewportIds?.[0]).toBe("c0")
        expect(c.isOnTop).toBe(true)
    })

    it("calls loadMoreBackwards when local spine cannot cover edge", () => {
        let load = vi.fn()
        let c2 = new ViewportIdSliceController<string>({ listSlice: 5, loadMoreBackwards: load })
        c2.getMore(undefined, { direction: "backwards" })
        expect(load).toHaveBeenCalled()
    })

    it("defaults listSlice to DEFAULT_LIST_SLICE", () => {
        let c = new ViewportIdSliceController<string>()
        c.sync(full)
        expect(c.viewportIds?.length).toBe(DEFAULT_LIST_SLICE)
    })

    it("reanchorAtIndex recenters the window on a far index", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        expect(c.fromOffset).toBe(0)
        expect(c.reanchorAtIndex(full, 50)).toBe(true)
        expect(c.viewportIds?.includes("c50")).toBe(true)
        expect(c.fromOffset).toBeGreaterThan(0)
        expect(c.reanchorAtIndex(full, 50)).toBe(false)
    })

    it("getMore backwards from the top keeps already-mounted ids", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        let first = [...(c.viewportIds ?? [])]
        expect(first).toEqual(["c0", "c1", "c2", "c3", "c4"])
        expect(c.getMore(full, { direction: "backwards" })).toBe(true)
        let next = c.viewportIds ?? []
        expect(next[0]).toBe("c0")
        expect(next).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"])
        expect(c.fromOffset).toBe(0)
        expect(c.isOnTop).toBe(true)
    })

    it("getMore slides the far side only after maxMounted", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        expect(c.getMore(full, { direction: "backwards" })).toBe(true)
        expect(c.getMore(full, { direction: "backwards" })).toBe(true)
        expect(c.viewportIds?.length).toBe(15)
        expect(c.fromOffset).toBe(0)
        expect(c.getMore(full, { direction: "backwards" })).toBe(true)
        expect(c.viewportIds?.length).toBe(15)
        expect(c.fromOffset).toBe(5)
        expect(c.viewportIds?.[0]).toBe("c5")
        expect(c.viewportIds?.[14]).toBe("c19")
    })

    it("trimToSlice recenters to ~2×listSlice around firstVisible", () => {
        let c = new ViewportIdSliceController<string>({ listSlice: 5 })
        c.sync(full)
        for (let i = 0; i < 4; i++) c.getMore(full, { direction: "backwards" })
        expect((c.viewportIds?.length ?? 0) > 10).toBe(true)
        expect(c.trimToSlice(full, 12)).toBe(true)
        expect(c.viewportIds?.includes("c12")).toBe(true)
        expect((c.viewportIds?.length ?? 0) <= 10).toBe(true)
        expect(c.trimToSlice(full, 12)).toBe(false)
    })
})
