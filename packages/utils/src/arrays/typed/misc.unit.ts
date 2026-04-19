import { beforeEach, describe, expect, it } from "vitest"
import { getPlatformByteOrder, toDataView, view } from "./misc"
import type { TypedArray } from "./types"

describe("toDataView", () => {
    it("creates DataView with exact byteOffset, byteLength and shared buffer", () => {
        let arr = new Uint8Array([0x12, 0x34, 0x56, 0x78])
        arr = arr.subarray(1, 3)

        let dv = toDataView(arr)

        expect(dv.buffer).toBe(arr.buffer)
        expect(dv.byteOffset).toBe(1)
        expect(dv.byteLength).toBe(2)

        arr[0] = 0x99
        expect(dv.getUint8(0)).toBe(0x99)
    })

    it("works with all TypedArray variants including BigInt", () => {
        let cases: TypedArray[] = [
            new Uint8Array([1, 2]),
            new Int16Array([0x1234]),
            new Float32Array([3.14]),
            new BigInt64Array([BigInt(0x12345678)]),
            new BigUint64Array([BigInt(0xabcdef)]),
        ]

        for (let buf of cases) {
            let dv = toDataView(buf)
            expect(dv.byteLength).toBe(buf.byteLength)
            expect(dv.byteOffset).toBe(buf.byteOffset)
        }
    })

    it("handles empty TypedArray", () => {
        let empty = new Uint8Array([])
        let dv = toDataView(empty)
        expect(dv.byteLength).toBe(0)
    })
})

describe("view", () => {
    it("reinterprets bytes as different TypedArray type", () => {
        let u8 = new Uint8Array([0x78, 0x56, 0x34, 0x12])

        let u16 = view(Uint16Array, u8)
        expect(u16).toBeInstanceOf(Uint16Array)
        expect(u16.length).toBe(2)
        expect(u16[0]).toBe(0x5678)
        expect(u16[1]).toBe(0x1234)

        let u32 = view(Uint32Array, u8)
        expect(u32.length).toBe(1)
        expect(u32[0]).toBe(0x12345678)
    })

    it("preserves byteOffset and creates correct length", () => {
        let u8 = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
        let sub = u8.subarray(2, 6)

        let i16 = view(Int16Array, sub)
        expect(i16.length).toBe(2)
        expect(i16.byteOffset).toBe(2)
        expect(i16[0]).toBe(0x0302)
        expect(i16[1]).toBe(0x0504)
    })

    it("works with BigInt64 / BigUint64Array", () => {
        let u8 = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
        let i64 = view(BigInt64Array, u8)
        expect(i64.length).toBe(1)
        expect(i64[0]).toBe(BigInt("0x0807060504030201"))
    })

    it("throws on non-multiple byteLength (invalid reinterpret)", () => {
        let u8 = new Uint8Array([1, 2, 3])
        expect(() => view(Uint32Array, u8)).toThrow()
    })
})

describe("getPlatformByteOrder", () => {
    let originalCache: boolean | null

    beforeEach(() => {
        originalCache = (getPlatformByteOrder as any)._cachedByteOrder
        ;(getPlatformByteOrder as any)._cachedByteOrder = null
    })

    it('returns "little" or "big" and caches result', () => {
        let first = getPlatformByteOrder()
        let second = getPlatformByteOrder()

        expect(first).toMatch(/^(little|big)$/)
        expect(second).toBe(first) // cache hit

        expect((getPlatformByteOrder as any)._cachedByteOrder).not.toBeNull()
    })

    it("correctly detects platform endianness via known test pattern", () => {
        let buffer = new ArrayBuffer(2)
        let dv = new DataView(buffer)
        dv.setUint16(0, 0x1234, true)

        let isLittle = new Uint16Array(buffer)[0] === 0x1234
        let expected = isLittle ? "little" : "big"

        expect(getPlatformByteOrder()).toBe(expected)
    })
})
