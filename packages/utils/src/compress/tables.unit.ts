import { describe, expect, it } from "vitest"
import {
    codeLengthOrder,
    distanceBase,
    fixedDistanceExtraBits,
    fixedDistanceLengths,
    fixedLengthExtraBits,
    fixedLiteralLengths,
    lengthBase,
} from "./tables"

describe("RFC 1951 tables", () => {
    it("uses the fixed Huffman length alphabet", () => {
        expect(fixedLiteralLengths.length).toBe(288)
        expect(fixedLiteralLengths.subarray(0, 144).every((n) => n === 8)).toBe(true)
        expect(fixedLiteralLengths.subarray(144, 256).every((n) => n === 9)).toBe(true)
        expect(fixedLiteralLengths.subarray(256, 280).every((n) => n === 7)).toBe(true)
        expect(fixedLiteralLengths.subarray(280, 288).every((n) => n === 8)).toBe(true)
    })

    it("uses 5-bit fixed distance codes", () => {
        expect(fixedDistanceLengths.length).toBe(32)
        expect(fixedDistanceLengths.every((n) => n === 5)).toBe(true)
    })

    it("orders the code-length alphabet as in RFC 1951 §3.2.7", () => {
        expect([...codeLengthOrder]).toEqual([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15])
    })

    it("ends the length extra-bits table at 258 with no extra bits", () => {
        expect(fixedLengthExtraBits[28]).toBe(0)
        expect(lengthBase[28]).toBe(258)
        expect(lengthBase[0]).toBe(3)
    })

    it("starts distances at 1 and ends at 24577", () => {
        expect(distanceBase[0]).toBe(1)
        expect(distanceBase[29]).toBe(24577)
        expect(fixedDistanceExtraBits[29]).toBe(13)
    })
})
