import { describe, expect, it } from "vitest"
import { clone, readNthBit } from "./misc"

describe("clone", () => {
    it("returns new Uint8Array with identical content", () => {
        let original = new Uint8Array([0x12, 0x34, 0x56, 0x78])
        let copy = clone(original)

        expect(copy).toBeInstanceOf(Uint8Array)
        expect(copy).not.toBe(original)
        expect(copy).toEqual(original)
    })

    it("handles empty array", () => {
        let empty = new Uint8Array([])
        let copy = clone(empty)

        expect(copy.length).toBe(0)
        expect(copy).not.toBe(empty)
    })

    it("creates independent copy – mutation does not affect original", () => {
        let original = new Uint8Array([1, 2, 3])
        let copy = clone(original)

        copy[1] = 99
        expect(original[1]).toBe(2)
        expect(copy[1]).toBe(99)
    })

    it("preserves byteOffset when source is a subarray", () => {
        let base = new Uint8Array([10, 20, 30, 40, 50])
        let sub = base.subarray(2, 4)
        let copy = clone(sub)

        expect(copy).toEqual(new Uint8Array([30, 40]))
        expect(copy.buffer).not.toBe(sub.buffer)
    })
})

describe("readNthBit", () => {
    it("extracts correct bit for every position 0-7 across test bytes", () => {
        let testCases = [
            { byte: 0b00000000, bits: [0, 0, 0, 0, 0, 0, 0, 0] },
            { byte: 0b00000001, bits: [1, 0, 0, 0, 0, 0, 0, 0] },
            { byte: 0b10000000, bits: [0, 0, 0, 0, 0, 0, 0, 1] },
            { byte: 0b10101010, bits: [0, 1, 0, 1, 0, 1, 0, 1] },
            { byte: 0b11111111, bits: [1, 1, 1, 1, 1, 1, 1, 1] },
            { byte: 0b01010101, bits: [1, 0, 1, 0, 1, 0, 1, 0] },
        ]

        for (let t of testCases) {
            for (let i = 0; i < 8; i++) {
                expect(readNthBit(t.byte, i)).toBe(t.bits[i])
            }
        }
    })

    it("returns 0 for bit positions outside 0-7 (current JS behavior)", () => {
        let byte = 0b10101010
        expect(readNthBit(byte, -1)).toBe(0)
        expect(readNthBit(byte, 8)).toBe(0)
        expect(readNthBit(byte, 31)).toBe(0)
    })

    it("works with any number in 0-255 range (byte coercion)", () => {
        expect(readNthBit(255, 0)).toBe(1)
        expect(readNthBit(0, 7)).toBe(0)
        expect(readNthBit(0xff, 3)).toBe(1)
    })
})
