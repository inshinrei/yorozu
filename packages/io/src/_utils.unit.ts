import { describe, expect, it } from "vitest"
import { getDv, nextPowerOfTwo } from "./_utils"

describe("nextPowerOfTwo", () => {
    it("returns exact power of two for already-power-of-two inputs", () => {
        expect(nextPowerOfTwo(1)).toBe(1)
        expect(nextPowerOfTwo(2)).toBe(2)
        expect(nextPowerOfTwo(4)).toBe(4)
        expect(nextPowerOfTwo(8)).toBe(8)
        expect(nextPowerOfTwo(16)).toBe(16)
        expect(nextPowerOfTwo(32)).toBe(32)
        expect(nextPowerOfTwo(1024)).toBe(1024)
        expect(nextPowerOfTwo(1 << 30)).toBe(1 << 30)
    })

    it("computes smallest power of two >= n for non-powers", () => {
        expect(nextPowerOfTwo(3)).toBe(4)
        expect(nextPowerOfTwo(5)).toBe(8)
        expect(nextPowerOfTwo(6)).toBe(8)
        expect(nextPowerOfTwo(7)).toBe(8)
        expect(nextPowerOfTwo(9)).toBe(16)
        expect(nextPowerOfTwo(15)).toBe(16)
        expect(nextPowerOfTwo(17)).toBe(32)
        expect(nextPowerOfTwo(1023)).toBe(1024)
        expect(nextPowerOfTwo(1025)).toBe(2048)
    })

    it("round-trips correctly: result is always power of two and >= input", () => {
        for (let i = 0; i <= 1_000_000; i += 997) {
            let p = nextPowerOfTwo(i)
            expect(p).toBeGreaterThanOrEqual(i)
            expect(p & (p - 1)).toBe(0)
            expect(nextPowerOfTwo(p)).toBe(p)
        }
    })
})

describe("getDv", () => {
    it("returns DataView for the backing ArrayBuffer", () => {
        let u8 = new Uint8Array([1, 2, 3, 4])
        let dv = getDv(u8)

        expect(dv).toBeInstanceOf(DataView)
        expect(dv.buffer).toBe(u8.buffer)
        expect(dv.byteLength).toBe(u8.byteLength)
        expect(dv.getUint32(0)).toBe(0x01020304)
    })

    it("caches and returns identical DataView for same backing ArrayBuffer", () => {
        let u8 = new Uint8Array(16)
        let dv1 = getDv(u8)
        let dv2 = getDv(u8)

        expect(dv1).toBe(dv2)
    })

    it("caches per ArrayBuffer, not per Uint8Array view", () => {
        let ab = new ArrayBuffer(8)
        let view1 = new Uint8Array(ab, 0, 4)
        let view2 = new Uint8Array(ab, 4, 4)

        let dv1 = getDv(view1)
        let dv2 = getDv(view2)

        expect(dv1).toBe(dv2)
    })

    it("creates new DataView for different ArrayBuffers", () => {
        let u8a = new Uint8Array(8)
        let u8b = new Uint8Array(8)

        let dva = getDv(u8a)
        let dvb = getDv(u8b)

        expect(dva).not.toBe(dvb)
    })

    it("works with sliced Uint8Array views (same backing)", () => {
        let original = new Uint8Array([10, 20, 30, 40, 50])
        let slice = original.subarray(1, 4)

        let dv = getDv(slice)
        expect(dv.buffer).toBe(original.buffer)
    })

    it("handles empty Uint8Array gracefully", () => {
        let empty = new Uint8Array(0)
        let dv = getDv(empty)

        expect(dv).toBeInstanceOf(DataView)
        expect(dv.byteLength).toBe(0)
    })
})
