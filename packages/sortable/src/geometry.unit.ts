import { describe, expect, it } from "vitest"
import {
    computeInsertIndex,
    computeInsertIndex1d,
    moveItem,
    readAxisSnapshot,
    rectToAxisSnapshot,
    toTargetIndex,
    type RectSnapshot,
} from "./geometry"

function makeRects(): RectSnapshot[] {
    return [0, 40, 80].map((top, i) => ({
        key: i + 1,
        top,
        bottom: top + 40,
        height: 40,
        mid: top + 20,
    }))
}

describe("moveItem (pure)", () => {
    it("moves item forward", () => {
        let arr = [1, 2, 3, 4]
        expect(moveItem(arr, 0, 2)).toEqual([2, 3, 1, 4])
    })

    it("moves item backward", () => {
        let arr = [1, 2, 3, 4]
        expect(moveItem(arr, 3, 1)).toEqual([1, 4, 2, 3])
    })

    it("no-op when from === to", () => {
        let arr = [1, 2, 3]
        expect(moveItem(arr, 1, 1)).toBe(arr)
    })
})

describe("computeInsertIndex (pure)", () => {
    it("returns 0 for an empty rect set", () => {
        expect(computeInsertIndex([], 50)).toBe(0)
    })

    it.each([
        ["above the first mid", -10, 0],
        ["just above the first mid", 19, 0],
        ["between first and second mid", 21, 1],
        ["between second and third mid", 61, 2],
        ["below the last mid", 200, 3],
    ])("pointer %s → index %i", (_label, clientY, expected) => {
        expect(computeInsertIndex(makeRects(), clientY as number)).toBe(expected as number)
    })
})

describe("toTargetIndex (pure)", () => {
    it.each([
        [0, 2, 1],
        [1, 3, 2],
        [2, 0, 0],
        [2, 2, 2],
        [3, 1, 1],
    ])("srcIdx=%i, visualIdx=%i → %i", (srcIdx, visualIdx, expected) => {
        expect(toTargetIndex(srcIdx, visualIdx)).toBe(expected)
    })
})

describe("scroll-compensated insert index", () => {
    it("parks pointer and scrolls down to reveal lower insert slots", () => {
        let rects = makeRects()
        let parkedY = 50
        expect(computeInsertIndex(rects, parkedY)).toBe(1)
        expect(computeInsertIndex(rects, parkedY + 80)).toBe(3)
    })

    it("parks pointer and scrolls up to reveal upper insert slots", () => {
        let rects = makeRects()
        let parkedY = 90
        expect(computeInsertIndex(rects, parkedY)).toBe(2)
        expect(computeInsertIndex(rects, parkedY + -40)).toBe(1)
    })
})

describe("computeInsertIndex1d (pure)", () => {
    it("computeInsertIndex1d matches computeInsertIndex on Y rects", () => {
        let rects = makeRects()
        let snaps = rects.map(rectToAxisSnapshot)
        expect(computeInsertIndex1d(snaps, 61)).toBe(computeInsertIndex(rects, 61))
    })
})

describe("readAxisSnapshot", () => {
    it("reads Y top/height and X left/width", () => {
        let el = {
            getBoundingClientRect: () => ({
                top: 10,
                bottom: 50,
                left: 20,
                right: 80,
                height: 40,
                width: 60,
            }),
        } as HTMLElement
        expect(readAxisSnapshot(el, "y", "a")).toEqual({ key: "a", start: 10, end: 50, size: 40, mid: 30 })
        expect(readAxisSnapshot(el, "x", "a")).toEqual({ key: "a", start: 20, end: 80, size: 60, mid: 50 })
    })
})
