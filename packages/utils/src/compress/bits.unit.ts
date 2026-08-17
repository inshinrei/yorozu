import { describe, expect, it } from "vitest"
import { byteCeil, readBits, readBits16, writeBits, writeBits16 } from "./bits"

describe("byteCeil", () => {
    it("rounds a bit position up to a whole byte count", () => {
        expect(byteCeil(0)).toBe(0)
        expect(byteCeil(1)).toBe(1)
        expect(byteCeil(8)).toBe(1)
        expect(byteCeil(9)).toBe(2)
    })
})

describe("bit read/write", () => {
    it("roundtrips values that straddle a byte boundary", () => {
        let buf = new Uint8Array(8)
        let pos = 0
        writeBits(buf, pos, 0b101)
        pos += 3
        writeBits16(buf, pos, 0b1_0000_1111_0000)
        pos += 13
        writeBits(buf, pos, 0b111111)
        pos += 6

        expect(readBits(buf, 0, 7)).toBe(0b101)
        expect(readBits16(buf, 3) & 0x1fff).toBe(0b1_0000_1111_0000)
        expect(readBits(buf, 16, 63)).toBe(0b111111)
        expect(byteCeil(pos)).toBe(3)
    })
})
