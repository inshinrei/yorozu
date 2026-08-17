import { describe, expect, it } from "vitest"
import { buildOrderDiff, classifyReorderAnim } from "./classify"
import type { Key } from "../core/types"

function mapOf(entries: Array<[Key, number]>): Map<Key, number> {
    return new Map(entries)
}

describe("reorder-animation-classify", () => {
    it("buildOrderDiff computes new − old and −Infinity for new keys", () => {
        let prev = mapOf([
            ["a", 0],
            ["b", 1],
            ["c", 2],
        ])
        let curr = mapOf([
            ["b", 0],
            ["a", 1],
            ["c", 2],
            ["d", 3],
        ])
        let diff = buildOrderDiff(prev, curr)
        expect(diff.get("a")).toBe(1) // 1 − 0
        expect(diff.get("b")).toBe(-1) // 0 − 1
        expect(diff.get("c")).toBe(0)
        expect(diff.get("d")).toBe(-Infinity)
    })

    it("classifies adjacent swap: one up Opacity (minority), one down Move (majority of 1=1 ups prefer opacity)", () => {
        // numberOfUp <= numberOfDown && orderDiff < 0 → Opacity
        // ups=1 downs=1 → up is Opacity; down is Move (numberOfDown < numberOfUp is false)
        let diff = mapOf([
            ["a", 1], // down
            ["b", -1], // up
        ])
        expect(classifyReorderAnim(diff, "b")).toBe("opacity")
        expect(classifyReorderAnim(diff, "a")).toBe("move")
        expect(classifyReorderAnim(diff, "missing")).toBe("none")
    })

    it("classifies bubble-to-top among many: minority up Opacity, majority downs Move", () => {
        // row e moves 4 → 0 (diff −4); a–d each shift +1
        let diff = mapOf([
            ["e", -4],
            ["a", 1],
            ["b", 1],
            ["c", 1],
            ["d", 1],
        ])
        expect(classifyReorderAnim(diff, "e")).toBe("opacity")
        expect(classifyReorderAnim(diff, "a")).toBe("move")
        expect(classifyReorderAnim(diff, "d")).toBe("move")
    })

    it("classifies new key as opacity", () => {
        let diff = mapOf([["new", -Infinity]])
        expect(classifyReorderAnim(diff, "new")).toBe("opacity")
    })

    it("returns none for zero diff", () => {
        let diff = mapOf([["x", 0]])
        expect(classifyReorderAnim(diff, "x")).toBe("none")
    })
})
