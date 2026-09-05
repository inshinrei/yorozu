import { describe, expect, it } from "vitest"
import { reverse8Bits, reverseBits, reverseBitsAll, reverseBitsBig } from "./utils"

describe("bit reversal utilities", () => {
    it("reverseBits round-trips correctly for all bit widths up to 32", () => {
        let widths = [1, 4, 8, 16, 32]
        for (let w of widths) {
            for (let i = 0; i < 1 << Math.min(w, 16); i++) {
                let reversed = reverseBits(i, w)
                expect(reverseBits(reversed, w)).toBe(i)
            }
        }
    })

    it("reverseBits handles edge cases", () => {
        expect(reverseBits(0, 1)).toBe(0)
        expect(reverseBits(1, 1)).toBe(1)
        expect(reverseBits(0b101, 3)).toBe(0b101)
        expect(reverseBits(0b0001, 4)).toBe(0b1000)
        expect(reverseBits(0b1111_1111_1111_1111, 16)).toBe(0b1111_1111_1111_1111)
    })

    it("reverseBitsBig matches number version and supports bigint size", () => {
        let value = 0b10110n
        expect(reverseBitsBig(value, 5)).toBe(0b01101n)
        expect(reverseBitsBig(value, 5n)).toBe(0b01101n)

        let reversed = reverseBitsBig(0b11001100n, 8n)
        expect(reverseBitsBig(reversed, 8n)).toBe(0b11001100n)
    })

    it("reverseBitsBig handles large sizes and zero", () => {
        expect(reverseBitsBig(0n, 64)).toBe(0n)
        expect(reverseBitsBig(1n, 1)).toBe(1n)
        expect(reverseBitsBig(0b1n, 64)).toBe(1n << 63n)
    })

    it("reverseBitsAll mutates Uint8Array in-place and is equivalent to per-byte reverse8Bits", () => {
        let buf = new Uint8Array([0x00, 0x01, 0x80, 0xff, 0b10101010])
        let original = buf.slice()

        reverseBitsAll(buf)

        for (let i = 0; i < original.length; i++) {
            expect(buf[i]).toBe(reverse8Bits(original[i]))
        }

        reverseBitsAll(buf)
        expect(buf).toEqual(original)
    })

    it("reverseBitsAll works on empty and single-byte buffers", () => {
        let empty = new Uint8Array()
        reverseBitsAll(empty)
        expect(empty.length).toBe(0)

        let single = new Uint8Array([0b00010000])
        reverseBitsAll(single)
        expect(single[0]).toBe(0b00001000)
    })
})
