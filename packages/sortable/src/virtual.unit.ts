// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { estimateAxisSnapshots } from "./virtual"

function fakeEl(start: number, size: number, axis: "x" | "y"): HTMLElement {
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

describe("estimateAxisSnapshots", () => {
    it("keeps full key order when only a subset is mounted", () => {
        let itemEls = new Map<string | number, HTMLElement>([
            ["a", fakeEl(0, 40, "y")],
            ["b", fakeEl(40, 40, "y")],
        ])
        let snaps = estimateAxisSnapshots({
            keys: ["a", "b", "c", "d", "e"],
            itemEls,
            axis: "y",
            itemSize: 40,
            originStart: 0,
        })
        expect(snaps.map((s) => s.key)).toEqual(["a", "b", "c", "d", "e"])
        expect(snaps[3]!.mid).toBe(140)
        expect(snaps[0]!.mid).toBe(20)
    })

    it("uses originStart for unmounted keys when the window is scrolled", () => {
        let snaps = estimateAxisSnapshots({
            keys: ["a", "b", "c"],
            itemEls: new Map(),
            axis: "y",
            itemSize: 72,
            originStart: -72,
        })
        expect(snaps[0]!.start).toBe(-72)
        expect(snaps[2]!.start).toBe(72)
    })

    it("estimates unmounted keys on X the same way", () => {
        let itemEls = new Map<string | number, HTMLElement>([["a", fakeEl(0, 80, "x")]])
        let snaps = estimateAxisSnapshots({
            keys: ["a", "b"],
            itemEls,
            axis: "x",
            itemSize: 80,
            originStart: 0,
        })
        expect(snaps[0]!.mid).toBe(40)
        expect(snaps[1]!.start).toBe(80)
        expect(snaps[1]!.end).toBe(160)
    })
})
