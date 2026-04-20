import { describe, expect, it } from "vitest"
import { fromBytes, toBytes } from "./bytes"

describe("bigint byte conversion", () => {
    describe("toBytes", () => {
        it("converts positive bigint to minimal big-endian bytes by default", () => {
            expect(toBytes(0n)).toEqual(new Uint8Array([]))
            expect(toBytes(1n)).toEqual(new Uint8Array([1]))
            expect(toBytes(0xffn)).toEqual(new Uint8Array([0xff]))
            expect(toBytes(0x100n)).toEqual(new Uint8Array([1, 0]))
            expect(toBytes(0xdeadbeefn)).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
        })

        it("respects little-endian flag", () => {
            expect(toBytes(0x1234n, 0, true)).toEqual(new Uint8Array([0x34, 0x12]))
            expect(toBytes(0xdeadbeefn, 0, true)).toEqual(new Uint8Array([0xef, 0xbe, 0xad, 0xde]))
        })

        it("uses explicit length with zero-padding (big-endian)", () => {
            expect(toBytes(0x1234n, 6)).toEqual(new Uint8Array([0, 0, 0, 0, 0x12, 0x34]))
            expect(toBytes(0xffn, 4)).toEqual(new Uint8Array([0, 0, 0, 0xff]))
        })

        it("throws RangeError when value does not fit in specified length", () => {
            expect(() => toBytes(0x100n, 1)).toThrow(RangeError)
            expect(() => toBytes(0xdeadbeefn, 3)).toThrow(RangeError)
        })

        it("handles negative numbers as two’s complement when length is given", () => {
            expect(toBytes(-1n, 4)).toEqual(new Uint8Array([0xff, 0xff, 0xff, 0xff]))
            expect(toBytes(-2n, 2)).toEqual(new Uint8Array([0xff, 0xfe]))
            expect(toBytes(-1n, 1)).toEqual(new Uint8Array([0xff]))
        })

        it("zero with explicit length returns zero-filled array", () => {
            expect(toBytes(0n, 8)).toEqual(new Uint8Array(8))
        })
    })

    describe("fromBytes", () => {
        it("converts big-endian bytes back to bigint", () => {
            expect(fromBytes(new Uint8Array([0x12, 0x34]))).toBe(0x1234n)
            expect(fromBytes(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe(0xdeadbeefn)
            expect(fromBytes(new Uint8Array([]))).toBe(0n)
        })

        it("respects little-endian flag", () => {
            expect(fromBytes(new Uint8Array([0x34, 0x12]), true)).toBe(0x1234n)
            expect(fromBytes(new Uint8Array([0xef, 0xbe, 0xad, 0xde]), true)).toBe(0xdeadbeefn)
        })

        it("handles leading zero bytes", () => {
            expect(fromBytes(new Uint8Array([0, 0, 0, 0x01]))).toBe(1n)
        })
    })

    describe("roundtrip", () => {
        it("roundtrip works for positive numbers with minimal length", () => {
            const positives = [0n, 1n, 0xffn, 0x1234n, 0xdeadbeefn]
            for (const v of positives) {
                expect(fromBytes(toBytes(v))).toBe(v)
            }
        })

        it("roundtrip works when explicit length is used (two’s complement)", () => {
            const testCases = [-1n, -123456789n, 0n, 1n, 0xffn]

            for (const v of testCases) {
                const bytes = toBytes(v, 8)
                const back = fromBytes(bytes)
                // Note: fromBytes is always unsigned, so we expect the positive equivalent for negative inputs
                if (v < 0n) {
                    const expected = (1n << 64n) + v
                    expect(back).toBe(expected)
                } else {
                    expect(back).toBe(v)
                }
            }
        })
    })
})
