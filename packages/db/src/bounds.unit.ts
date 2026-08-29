import { describe, expect, it } from "vitest"
import { compareIndexKey, inRange } from "./bounds"

describe("compareIndexKey", () => {
    it("orders number < string < array", () => {
        expect(compareIndexKey(1, "a")).toBe(-1)
        expect(compareIndexKey("a", [1])).toBe(-1)
    })

    it("treats shorter prefix-equal array as less", () => {
        expect(compareIndexKey([20], [20, 0])).toBe(-1)
        expect(compareIndexKey([20, 0], [20])).toBe(1)
    })
})

describe("inRange prefix TTL", () => {
    it("lt [cutoff] excludes storedAt === cutoff", () => {
        expect(inRange([20, 8], { lt: [20] })).toBe(false)
        expect(inRange([19, 99], { lt: [20] })).toBe(true)
    })

    it("applies inclusive and exclusive bounds", () => {
        expect(inRange(5, { gte: 5, lt: 10 })).toBe(true)
        expect(inRange(10, { gte: 5, lt: 10 })).toBe(false)
        expect(inRange(10, { gt: 5, lte: 10 })).toBe(true)
        expect(inRange(5, { gt: 5 })).toBe(false)
        expect(inRange(1, {})).toBe(true)
    })
})

describe("compareIndexKey invalid keys", () => {
    it("throws on boolean, object, null, and NaN", () => {
        expect(() => compareIndexKey(true as never, 1)).toThrow(TypeError)
        expect(() => compareIndexKey({} as never, 1)).toThrow(TypeError)
        expect(() => compareIndexKey(null as never, 1)).toThrow(TypeError)
        expect(() => compareIndexKey(Number.NaN, 1)).toThrow(TypeError)
    })

    it("compares numbers and strings", () => {
        expect(compareIndexKey(1, 2)).toBe(-1)
        expect(compareIndexKey(2, 1)).toBe(1)
        expect(compareIndexKey(2, 2)).toBe(0)
        expect(compareIndexKey("a", "b")).toBe(-1)
        expect(compareIndexKey("b", "a")).toBe(1)
        expect(compareIndexKey([1, 2], [1, 2])).toBe(0)
        expect(compareIndexKey(1, [1])).toBe(-1)
    })
})
