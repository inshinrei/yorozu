import { describe, expect, it } from "vitest"
import {
    computeInsertIndexFlow,
    flowRectDelta,
    flowShiftDestIndex,
    readFlowRectSnapshot,
    shiftFlowRects,
    type FlowRectSnapshot,
} from "./flow-geometry"

function rect(key: string, left: number, top: number, width: number, height: number): FlowRectSnapshot {
    return {
        key,
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        cx: left + width / 2,
        cy: top + height / 2,
    }
}

function wrap2x2(): FlowRectSnapshot[] {
    return [rect("a", 0, 0, 48, 48), rect("b", 52, 0, 48, 48), rect("c", 0, 52, 48, 48), rect("d", 52, 52, 48, 48)]
}

function filesWrap(): FlowRectSnapshot[] {
    return [rect("w", 0, 0, 200, 48), rect("n", 204, 0, 80, 48), rect("m", 0, 52, 120, 48)]
}

describe("readFlowRectSnapshot", () => {
    it("reads left/top/width/height and centers", () => {
        let el = {
            getBoundingClientRect: () => ({
                left: 10,
                top: 20,
                right: 70,
                bottom: 68,
                width: 60,
                height: 48,
            }),
        } as HTMLElement
        expect(readFlowRectSnapshot(el, "a")).toEqual({
            key: "a",
            left: 10,
            top: 20,
            right: 70,
            bottom: 68,
            width: 60,
            height: 48,
            cx: 40,
            cy: 44,
        })
    })
})

describe("computeInsertIndexFlow (pure)", () => {
    it("returns 0 for an empty rect set", () => {
        expect(computeInsertIndexFlow([], 10, 10)).toBe(0)
    })

    it.each([
        ["left of first on row 0", 10, 24, 0],
        ["between a and b centers", 40, 24, 1],
        ["right of last on row 0", 200, 24, 2],
        ["left of first on row 1", 10, 76, 2],
        ["between c and d centers", 40, 76, 3],
        ["right of last on row 1", 200, 76, 4],
        ["below every row", 40, 400, 4],
    ])("%s → %i", (_label, x, y, expected) => {
        expect(computeInsertIndexFlow(wrap2x2(), x, y)).toBe(expected)
    })

    it("variable-width wrap: pointer past last on row 0 inserts at next row start", () => {
        expect(computeInsertIndexFlow(filesWrap(), 400, 24)).toBe(2)
    })

    it("variable-width wrap: pointer left of the second-row chip inserts at that chip", () => {
        expect(computeInsertIndexFlow(filesWrap(), 10, 76)).toBe(2)
    })

    it("variable-width wrap: pointer past the second-row chip appends", () => {
        expect(computeInsertIndexFlow(filesWrap(), 400, 76)).toBe(3)
    })

    it("keeps slightly staggered tops on one row (tolerance = half min height)", () => {
        let staggered = [rect("a", 0, 0, 48, 48), rect("b", 52, 2, 48, 48)]
        expect(computeInsertIndexFlow(staggered, 200, 24)).toBe(2)
    })
})

describe("shiftFlowRects", () => {
    it("translates client-space rects by dx/dy", () => {
        let [shifted] = shiftFlowRects([rect("a", 10, 20, 48, 48)], -5, -8)
        expect(shifted).toEqual(rect("a", 5, 12, 48, 48))
    })
})

describe("flowShiftDestIndex", () => {
    it.each([
        [0, 2, 0, null],
        [0, 2, 1, 0],
        [0, 2, 2, null],
        [0, 4, 1, 0],
        [0, 4, 2, 1],
        [0, 4, 3, 2],
        [3, 0, 0, 1],
        [3, 0, 1, 2],
        [3, 0, 2, 3],
        [3, 0, 3, null],
    ])("src=%i insert=%i item=%i → %s", (src, insert, item, expected) => {
        expect(flowShiftDestIndex(src, insert, item)).toBe(expected)
    })
})

describe("flowRectDelta", () => {
    it("is dest origin minus src origin", () => {
        expect(flowRectDelta(rect("b", 52, 0, 48, 48), rect("a", 0, 0, 48, 48))).toEqual({
            x: -52,
            y: 0,
        })
        expect(flowRectDelta(rect("c", 0, 52, 48, 48), rect("b", 52, 0, 48, 48))).toEqual({
            x: 52,
            y: -52,
        })
    })
})
