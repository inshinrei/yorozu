import { beforeEach, describe, expect, it, vi } from "vitest"
import { xor, xorInPlace } from "./xor"
import { allocate } from "./pool"

vi.mock("./pool", () => ({
    allocate: vi.fn((size: number) => new Uint8Array(size)),
}))

const mockAllocate = vi.mocked(allocate)

describe("xor", () => {
    beforeEach(() => {
        mockAllocate.mockClear()
    })

    it("allocates new buffer and returns XOR result when key.length >= data.length", () => {
        let data = new Uint8Array([0b00001111, 0b10101010])
        let key = new Uint8Array([0b11110000, 0b01010101])

        let result = xor(data, key)

        expect(mockAllocate).toHaveBeenCalledTimes(1)
        expect(mockAllocate).toHaveBeenCalledWith(2)
        expect(result).toEqual(new Uint8Array([0b11111111, 0b11111111]))
    })

    it("throws RangeError when key is shorter than data", () => {
        let data = new Uint8Array([0x12, 0x34, 0x56])
        let key = new Uint8Array([0xff])

        expect(() => xor(data, key)).toThrow(RangeError)
        expect(() => xor(data, key)).toThrow(/Key must be at least as long as data/)
    })

    it("ignores extra bytes when key is longer than data", () => {
        let data = new Uint8Array([0x12, 0x34])
        let key = new Uint8Array([0xff, 0xff, 0xff])

        let result = xor(data, key)
        expect(result).toEqual(new Uint8Array([0xed, 0xcb]))
    })

    it("handles empty data (allocates 0-length)", () => {
        let result = xor(new Uint8Array([]), new Uint8Array([1, 2]))
        expect(mockAllocate).toHaveBeenCalledWith(0)
        expect(result).toEqual(new Uint8Array([]))
    })

    it("returns independent copy – original data untouched", () => {
        let data = new Uint8Array([0x01, 0x02])
        let key = new Uint8Array([0xff, 0xff])
        let originalData = new Uint8Array(data)

        let result = xor(data, key)
        expect(data).toEqual(originalData)
        expect(result).not.toBe(data)
    })
})

describe("xorInPlace", () => {
    it("mutates data buffer in place when key.length >= data.length", () => {
        let data = new Uint8Array([0b00001111, 0b10101010, 0b11001100])
        let key = new Uint8Array([0b11110000, 0b01010101, 0b00110011])

        xorInPlace(data, key)
        expect(data).toEqual(new Uint8Array([0b11111111, 0b11111111, 0b11111111]))
    })

    it("throws RangeError when key is shorter than data", () => {
        let data = new Uint8Array([0x12, 0x34, 0x56])
        let key = new Uint8Array([0xff])

        expect(() => xorInPlace(data, key)).toThrow(RangeError)
        expect(() => xorInPlace(data, key)).toThrow(/Key must be at least as long as data/)
    })

    it("ignores extra bytes when key is longer than data", () => {
        let data = new Uint8Array([0x12, 0x34])
        let key = new Uint8Array([0xff, 0xff, 0xff])

        xorInPlace(data, key)
        expect(data).toEqual(new Uint8Array([0xed, 0xcb]))
    })

    it("does nothing on empty data", () => {
        let data = new Uint8Array([])
        xorInPlace(data, new Uint8Array([1]))
        expect(data).toEqual(new Uint8Array([]))
    })

    it("mutates subarray views (affects underlying buffer)", () => {
        let base = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])
        let sub = base.subarray(1, 3)

        xorInPlace(sub, new Uint8Array([0xff, 0xff]))
        expect(sub).toEqual(new Uint8Array([0x44, 0x33]))
        expect(base).toEqual(new Uint8Array([0xaa, 0x44, 0x33, 0xdd]))
    })
})
