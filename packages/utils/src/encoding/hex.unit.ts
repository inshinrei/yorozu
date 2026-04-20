import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decode, decodedLength, encode, encodedLength } from "./hex"

describe("hex encoding utilities", () => {
    beforeEach(() => {
        vi.stubGlobal("Buffer", undefined)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    describe("encode", () => {
        it("encodes Uint8Array to lowercase hex string", () => {
            const buf = new Uint8Array([0x01, 0x23, 0xab, 0xcd, 0xef])
            expect(encode(buf)).toBe("0123abcdef")
        })

        it("encodes empty buffer to empty string", () => {
            expect(encode(new Uint8Array([]))).toBe("")
        })

        it('uses native Buffer.toString("hex") when available', () => {
            const mockBuffer = { toString: vi.fn(() => "deadbeef") }
            vi.stubGlobal("Buffer", { from: () => mockBuffer })

            const buf = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
            expect(encode(buf)).toBe("deadbeef")
            expect(mockBuffer.toString).toHaveBeenCalledWith("hex")
        })

        it("uses Uint8Array.prototype.toHex when available", () => {
            const originalToHex = Uint8Array.prototype.toHex
            Uint8Array.prototype.toHex = function () {
                return "cafe"
            }

            const buf = new Uint8Array([0xca, 0xfe])
            expect(encode(buf)).toBe("cafe")

            Uint8Array.prototype.toHex = originalToHex
        })
    })

    describe("decode", () => {
        it("decodes lowercase hex string to Uint8Array", () => {
            const result = decode("0123abcdef")
            expect(result).toEqual(new Uint8Array([0x01, 0x23, 0xab, 0xcd, 0xef]))
        })

        it("decodes uppercase hex string", () => {
            expect(decode("DEADBEEF")).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
        })

        it("decodes odd-length hex string", () => {
            expect(() => decode("abc")).toThrow(TypeError)
        })

        it("decodes empty string to empty Uint8Array", () => {
            expect(decode("")).toEqual(new Uint8Array([]))
        })

        it("throws on invalid hex characters", () => {
            expect(() => decode("0123g")).toThrow("Invalid hex string")
            expect(() => decode("0123ZZ")).toThrow("Invalid hex string")
        })

        it("uses native Buffer.from when available", () => {
            const mockBuffer = new Uint8Array([0xde, 0xad])
            vi.stubGlobal("Buffer", { from: vi.fn(() => mockBuffer) })

            const result = decode("dead")
            expect(result).toEqual(mockBuffer)
        })

        it("uses Uint8Array.fromHex when available", () => {
            const originalFromHex = Uint8Array.fromHex
            Uint8Array.fromHex = vi.fn(() => new Uint8Array([0xca, 0xfe]))

            expect(decode("cafe")).toEqual(new Uint8Array([0xca, 0xfe]))

            Uint8Array.fromHex = originalFromHex
        })
    })

    describe("encodedLength / decodedLength", () => {
        it("encodedLength returns correct byte length for hex string", () => {
            expect(encodedLength(0)).toBe(0)
            expect(encodedLength(1)).toBe(2)
            expect(encodedLength(2)).toBe(4)
            expect(encodedLength(5)).toBe(10)
        })

        it("decodedLength returns correct byte length from hex string length", () => {
            expect(decodedLength(0)).toBe(0)
            expect(decodedLength(1)).toBe(1)
            expect(decodedLength(2)).toBe(1)
            expect(decodedLength(3)).toBe(2)
            expect(decodedLength(10)).toBe(5)
        })
    })

    describe("roundtrip correctness", () => {
        it("encode(decode(x)) === x for all valid hex strings", () => {
            const testCases = ["", "00", "deadbeef", "0123456789abcdef", "cafebabe", "ff"]

            for (const hex of testCases) {
                const decoded = decode(hex)
                const reEncoded = encode(decoded)
                expect(reEncoded).toBe(hex.toLowerCase())
            }
        })

        it("decode(encode(buf)) === buf for arbitrary Uint8Array", () => {
            const buf = new Uint8Array([0x00, 0x01, 0xff, 0x12, 0x34, 0xab, 0xcd, 0xef])
            const encoded = encode(buf)
            const decoded = decode(encoded)

            expect(decoded).toEqual(buf)
        })
    })
})
