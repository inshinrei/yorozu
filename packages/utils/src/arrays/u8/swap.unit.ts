import { describe, expect, it } from "vitest"
import { swap16, swap32, swap64, swapNibbles } from "./swap"

describe("swap16", () => {
    it("throws RangeError when length is not multiple of 2", () => {
        let odd = new Uint8Array([1, 2, 3])
        expect(() => swap16(odd)).toThrow(RangeError)
        expect(() => swap16(new Uint8Array([]))).not.toThrow()
    })

    it("correctly swaps every pair of bytes in place", () => {
        let buf = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0xab, 0xcd])
        swap16(buf)
        expect(buf).toEqual(new Uint8Array([0x34, 0x12, 0x78, 0x56, 0xcd, 0xab]))
    })

    it("does nothing on empty buffer", () => {
        let buf = new Uint8Array([])
        swap16(buf)
        expect(buf.length).toBe(0)
    })

    it("mutates subarray views correctly", () => {
        let base = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])
        let sub = base.subarray(1, 3)
        swap16(sub)
        expect(sub).toEqual(new Uint8Array([0xcc, 0xbb]))
        expect(base).toEqual(new Uint8Array([0xaa, 0xcc, 0xbb, 0xdd]))
    })
})

describe("swap32", () => {
    it("throws RangeError when length is not multiple of 4", () => {
        let bad = new Uint8Array([1, 2, 3])
        expect(() => swap32(bad)).toThrow(RangeError)
    })

    it("correctly reverses bytes in every 4-byte group in place", () => {
        let buf = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xff])
        swap32(buf)
        expect(buf).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12, 0xff, 0xde, 0xbc, 0x9a]))
    })

    it("handles length exactly 4", () => {
        let buf = new Uint8Array([0x11, 0x22, 0x33, 0x44])
        swap32(buf)
        expect(buf).toEqual(new Uint8Array([0x44, 0x33, 0x22, 0x11]))
    })
})

describe("swap64", () => {
    it("throws RangeError when length is not multiple of 8", () => {
        let bad = new Uint8Array(7)
        expect(() => swap64(bad)).toThrow(RangeError)
    })

    it("correctly reverses bytes in every 8-byte group in place", () => {
        let buf = new Uint8Array([
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
        ])
        swap64(buf)
        expect(buf).toEqual(
            new Uint8Array([
                0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x18, 0x17, 0x16, 0x15, 0x14, 0x13, 0x12, 0x11,
            ]),
        )
    })

    it("handles length exactly 8", () => {
        let buf = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80])
        swap64(buf)
        expect(buf).toEqual(new Uint8Array([0x80, 0x70, 0x60, 0x50, 0x40, 0x30, 0x20, 0x10]))
    })
})

describe("swapNibbles", () => {
    it("swaps high and low nibble of every byte in place", () => {
        let buf = new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0x00, 0xff])
        swapNibbles(buf)
        expect(buf).toEqual(new Uint8Array([0x21, 0x43, 0xba, 0xdc, 0x00, 0xff]))
    })

    it("works on empty buffer", () => {
        let buf = new Uint8Array([])
        swapNibbles(buf)
        expect(buf.length).toBe(0)
    })

    it("works on single byte", () => {
        let buf = new Uint8Array([0xa5])
        swapNibbles(buf)
        expect(buf).toEqual(new Uint8Array([0x5a]))
    })

    it("mutates subarray views", () => {
        let base = new Uint8Array([0x12, 0x34, 0x56])
        let sub = base.subarray(1)
        swapNibbles(sub)
        expect(sub).toEqual(new Uint8Array([0x43, 0x65]))
        expect(base).toEqual(new Uint8Array([0x12, 0x43, 0x65]))
    })

    it("is branchless and correct for all byte values", () => {
        let buf = new Uint8Array(256)
        for (let i = 0; i < 256; i++) buf[i] = i

        let original = new Uint8Array(buf)
        swapNibbles(buf)

        for (let i = 0; i < 256; i++) {
            let high = (original[i] & 0xf0) >> 4
            let low = original[i] & 0x0f
            expect(buf[i]).toBe((low << 4) | high)
        }
    })
})
