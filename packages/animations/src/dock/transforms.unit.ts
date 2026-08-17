import { describe, expect, it } from "vitest"
import { DOCK_EASING, DOCK_FADE_OFFSET, DOCK_MS, dockTransforms } from "./transforms"
import type { DockEdge } from "./transforms"

describe("dockTransforms", () => {
    it("exports default timing and fade offset", () => {
        expect(DOCK_MS).toBe(300)
        expect(DOCK_EASING).toBe("cubic-bezier(0.25, 1, 0.5, 1)")
        expect(DOCK_FADE_OFFSET).toBe("1.5rem")
    })

    it("slide right is full-edge translateX(100%) → 0", () => {
        let t = dockTransforms("slide", "right")
        expect(t.closed).toEqual({ transform: "translateX(100%)", opacity: "1" })
        expect(t.open).toEqual({ transform: "translateX(0)", opacity: "1" })
    })

    it("slide mirrors per edge", () => {
        expect(dockTransforms("slide", "left").closed.transform).toBe("translateX(-100%)")
        expect(dockTransforms("slide", "top").closed.transform).toBe("translateY(-100%)")
        expect(dockTransforms("slide", "bottom").closed.transform).toBe("translateY(100%)")
        expect(dockTransforms("slide", "left").open.transform).toBe("translateX(0)")
        expect(dockTransforms("slide", "top").open.transform).toBe("translateY(0)")
        expect(dockTransforms("slide", "bottom").open.transform).toBe("translateY(0)")
    })

    it("fade right is translateX(1.5rem) + opacity", () => {
        let t = dockTransforms("fade", "right")
        expect(t.closed).toEqual({ transform: "translateX(1.5rem)", opacity: "0" })
        expect(t.open).toEqual({ transform: "translateX(0)", opacity: "1" })
    })

    it("fade mirrors the 1.5rem offset per edge", () => {
        let edges: Array<[DockEdge, string, string]> = [
            ["left", "translateX(-1.5rem)", "translateX(0)"],
            ["top", "translateY(-1.5rem)", "translateY(0)"],
            ["bottom", "translateY(1.5rem)", "translateY(0)"],
        ]
        for (let [edge, closed, open] of edges) {
            let t = dockTransforms("fade", edge)
            expect(t.closed).toEqual({ transform: closed, opacity: "0" })
            expect(t.open).toEqual({ transform: open, opacity: "1" })
        }
    })
})
