import { describe, expect, it } from "vitest"
import { compare, equal } from "./compare"

describe("compare", () => {
    it("returns -1 when first array is shorter", () => {
        let a = new Uint8Array([1, 2])
        let b = new Uint8Array([1, 2, 3])
        expect(compare(a, b)).toBe(-1)
    })

    it("returns 1 when first array is longer", () => {
        let a = new Uint8Array([1, 2, 3])
        let b = new Uint8Array([1, 2])
        expect(compare(a, b)).toBe(1)
    })

    it("returns -1 on first differing element where a < b", () => {
        let a = new Uint8Array([1, 2, 3])
        let b = new Uint8Array([1, 3, 3])
        expect(compare(a, b)).toBe(-1)
    })

    it("returns 1 on first differing element where a > b", () => {
        let a = new Uint8Array([1, 4, 3])
        let b = new Uint8Array([1, 2, 3])
        expect(compare(a, b)).toBe(1)
    })

    it("returns 0 when arrays are identical", () => {
        let a = new Uint8Array([1, 2, 3])
        let b = new Uint8Array([1, 2, 3])
        expect(compare(a, b)).toBe(0)
    })

    it("handles empty arrays correctly", () => {
        let empty = new Uint8Array([])
        let nonEmpty = new Uint8Array([1])
        expect(compare(empty, empty)).toBe(0)
        expect(compare(empty, nonEmpty)).toBe(-1)
        expect(compare(nonEmpty, empty)).toBe(1)
    })

    it("works with all TypedArray variants including BigInt", () => {
        let testCases = [
            { a: new Int8Array([-1, 0]), b: new Int8Array([0, 0]), expected: -1 },
            { a: new Uint16Array([65535]), b: new Uint16Array([0]), expected: 1 },
            { a: new Float32Array([3.14, 2.71]), b: new Float32Array([3.14, 2.72]), expected: -1 },
            { a: new Float64Array([1.1]), b: new Float64Array([1.1]), expected: 0 },
            {
                a: new BigInt64Array([BigInt(5), BigInt(10)]),
                b: new BigInt64Array([BigInt(5), BigInt(9)]),
                expected: 1,
            },
            { a: new BigUint64Array([BigInt(0)]), b: new BigUint64Array([BigInt(0)]), expected: 0 },
        ]

        for (let t of testCases) {
            expect(compare(t.a, t.b)).toBe(t.expected)
        }
    })
})

describe("equal", () => {
    it("returns true only when arrays are identical", () => {
        let a = new Uint32Array([42, 100])
        let b = new Uint32Array([42, 100])
        let c = new Uint32Array([42, 101])

        expect(equal(a, b)).toBe(true)
        expect(equal(a, c)).toBe(false)
    })

    it("returns false for different lengths", () => {
        let short = new Int16Array([1])
        let long = new Int16Array([1, 2])
        expect(equal(short, long)).toBe(false)
    })

    it("works with BigInt arrays", () => {
        let a = new BigInt64Array([BigInt(-123), BigInt(456)])
        let b = new BigInt64Array([BigInt(-123), BigInt(456)])
        let c = new BigInt64Array([BigInt(-123), BigInt(457)])

        expect(equal(a, b)).toBe(true)
        expect(equal(a, c)).toBe(false)
    })

    it("handles empty arrays as equal", () => {
        let empty1 = new Float32Array([])
        let empty2 = new Float32Array([])
        expect(equal(empty1, empty2)).toBe(true)
    })
})
