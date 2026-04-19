import { describe, expect, it } from "vitest"
import { includes, includesArray, indexOf, indexOfArray, lastIndexOf, lastIndexOfArray } from "./find"

describe("indexOf", () => {
    it("finds first occurrence in regular TypedArray", () => {
        let haystack = new Uint8Array([10, 20, 30, 20, 40])
        expect(indexOf(haystack, 20)).toBe(1)
        expect(indexOf(haystack, 20, 2)).toBe(3)
        expect(indexOf(haystack, 99)).toBe(-1)
    })

    it("respects start index and handles negative/oversized start", () => {
        let haystack = new Int16Array([5, 6, 7, 8, 9])
        expect(indexOf(haystack, 7, 2)).toBe(2)
        expect(indexOf(haystack, 7, -5)).toBe(2)
        expect(indexOf(haystack, 7, 10)).toBe(-1)
    })

    it("works with BigInt64Array / BigUint64Array", () => {
        let haystack64 = new BigInt64Array([BigInt(1), BigInt(2), BigInt(3), BigInt(2)])
        expect(indexOf(haystack64, BigInt(2))).toBe(1)
        expect(indexOf(haystack64, BigInt(2), 2)).toBe(3)
    })

    it("returns -1 for empty haystack", () => {
        let empty = new Float32Array([])
        expect(indexOf(empty, 42)).toBe(-1)
    })
})

describe("lastIndexOf", () => {
    it("finds last occurrence in regular TypedArray", () => {
        let haystack = new Uint32Array([10, 20, 30, 20, 40])
        expect(lastIndexOf(haystack as any, 20 as any)).toBe(3)
        expect(lastIndexOf(haystack, 20, 2)).toBe(1)
    })

    it("respects start index (including default = length-1)", () => {
        let haystack = new Int8Array([1, 2, 3, 2, 4])
        expect(lastIndexOf(haystack as any, 2 as any)).toBe(3)
        expect(lastIndexOf(haystack, 2, 1)).toBe(1)
    })

    it("works with BigInt arrays", () => {
        let haystack = new BigUint64Array([BigInt(10), BigInt(20), BigInt(30), BigInt(20)])
        expect(lastIndexOf(haystack, BigInt(20))).toBe(3)
    })

    it("returns -1 when not found or empty", () => {
        let empty = new Uint16Array([])
        expect(lastIndexOf(empty as any, 5 as any)).toBe(-1)
    })
})

describe("indexOfArray", () => {
    it("finds sub-array (needle) in haystack", () => {
        let haystack = new Uint8Array([1, 2, 3, 4, 2, 3, 5])
        let needle = new Uint8Array([2, 3])
        expect(indexOfArray(haystack, needle)).toBe(1)
        expect(indexOfArray(haystack, needle, 3)).toBe(4)
    })

    it("handles single-element needle via indexOf fast-path", () => {
        let haystack = new Float64Array([1.1, 2.2, 3.3])
        let needle = new Float64Array([2.2])
        expect(indexOfArray(haystack, needle)).toBe(1)
    })

    it("returns start when needle is empty", () => {
        let haystack = new Int32Array([1, 2, 3])
        let empty = new Int32Array([])
        expect(indexOfArray(haystack, empty)).toBe(0)
        expect(indexOfArray(haystack, empty, 2)).toBe(2)
    })

    it("returns -1 when needle not found or longer than haystack", () => {
        let haystack = new Uint8Array([1, 2, 3])
        let needle = new Uint8Array([4, 5])
        expect(indexOfArray(haystack, needle)).toBe(-1)
        expect(indexOfArray(haystack, new Uint8Array([1, 2, 3, 4]))).toBe(-1)
    })

    it("works with BigInt arrays", () => {
        let haystack = new BigInt64Array([BigInt(1), BigInt(2), BigInt(3), BigInt(2), BigInt(3)])
        let needle = new BigInt64Array([BigInt(2), BigInt(3)])
        expect(indexOfArray(haystack, needle)).toBe(1)
    })
})

describe("lastIndexOfArray", () => {
    it("finds last occurrence of sub-array", () => {
        let haystack = new Uint8Array([1, 2, 3, 4, 2, 3, 5])
        let needle = new Uint8Array([2, 3])
        expect(lastIndexOfArray(haystack, needle)).toBe(4)
        expect(lastIndexOfArray(haystack, needle, 3)).toBe(1)
    })

    it("handles single-element needle via lastIndexOf fast-path", () => {
        let haystack = new Int16Array([10, 20, 30, 20])
        let needle = new Int16Array([20])
        expect(lastIndexOfArray(haystack, needle)).toBe(3)
    })

    it("returns start when needle is empty", () => {
        let haystack = new Float32Array([1, 2])
        let empty = new Float32Array([])
        expect(lastIndexOfArray(haystack, empty)).toBe(1)
    })

    it("returns -1 when not found", () => {
        let haystack = new Uint8Array([1, 2, 3])
        let needle = new Uint8Array([4])
        expect(lastIndexOfArray(haystack, needle)).toBe(-1)
    })

    it("works with BigInt arrays", () => {
        let haystack = new BigUint64Array([BigInt(1), BigInt(2), BigInt(3), BigInt(2), BigInt(3)])
        let needle = new BigUint64Array([BigInt(2), BigInt(3)])
        expect(lastIndexOfArray(haystack, needle)).toBe(3)
    })
})

describe("includes", () => {
    it("returns true when value exists", () => {
        let haystack = new Uint8Array([10, 20, 30])
        expect(includes(haystack, 20)).toBe(true)
    })

    it("returns false when value missing", () => {
        let haystack = new Int8Array([1, 2, 3])
        expect(includes(haystack, 99)).toBe(false)
    })

    it("supports BigInt needles", () => {
        let haystack = new BigInt64Array([BigInt(100), BigInt(200)])
        expect(includes(haystack, BigInt(200))).toBe(true)
    })
})

describe("includesArray", () => {
    it("returns true when sub-array exists", () => {
        let haystack = new Uint8Array([1, 2, 3, 4, 5])
        let needle = new Uint8Array([3, 4])
        expect(includesArray(haystack, needle)).toBe(true)
    })

    it("returns false when sub-array missing", () => {
        let haystack = new Int32Array([1, 2, 3])
        let needle = new Int32Array([4, 5])
        expect(includesArray(haystack, needle)).toBe(false)
    })

    it("handles empty needle as true", () => {
        let haystack = new Float64Array([1])
        let empty = new Float64Array([])
        expect(includesArray(haystack, empty)).toBe(true)
    })
})
