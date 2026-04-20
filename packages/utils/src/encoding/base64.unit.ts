import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decode, decodedLength, encode, encodedLength } from "./base64"

describe("Base64 utilities", () => {
    beforeEach(() => {
        vi.stubGlobal("Buffer", undefined)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    describe("encode", () => {
        it("encodes standard Base64 with padding", () => {
            expect(encode(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]))).toBe("SGVsbG8=")
            expect(encode(new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]))).toBe("Zm9vYmFy")
        })

        it("encodes URL-safe Base64 (no padding, - and _)", () => {
            expect(encode(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]), true)).toBe("SGVsbG8")
            expect(encode(new Uint8Array([251, 252, 253]), true)).toBe("-_z9")
        })

        it("encodes empty buffer to empty string", () => {
            expect(encode(new Uint8Array([]))).toBe("")
            expect(encode(new Uint8Array([]), true)).toBe("")
        })
    })

    describe("decode", () => {
        it("decodes standard Base64 with padding", () => {
            expect(decode("SGVsbG8=")).toEqual(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]))
            expect(decode("Zm9vYmFy")).toEqual(new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]))
        })

        it("decodes URL-safe Base64", () => {
            expect(decode("SGVsbG8", true)).toEqual(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]))
            expect(decode("-_z9", true)).toEqual(new Uint8Array([251, 252, 253]))
        })

        it("decodes empty string to empty buffer", () => {
            expect(decode("")).toEqual(new Uint8Array([]))
        })
    })

    describe("length helpers", () => {
        it("encodedLength returns correct length", () => {
            expect(encodedLength(0)).toBe(0)
            expect(encodedLength(1)).toBe(4)
            expect(encodedLength(2)).toBe(4)
            expect(encodedLength(3)).toBe(4)
            expect(encodedLength(4)).toBe(8)
        })

        it("decodedLength returns correct length", () => {
            expect(decodedLength(0)).toBe(0)
            expect(decodedLength(4)).toBe(3)
            expect(decodedLength(6)).toBe(4)
            expect(decodedLength(8)).toBe(6)
        })
    })

    describe("roundtrip", () => {
        const vectors = [
            new Uint8Array([]),
            new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
            new Uint8Array([251, 252, 253]),
        ]

        it("standard Base64 roundtrip", () => {
            for (const bytes of vectors) {
                expect(decode(encode(bytes))).toEqual(bytes)
            }
        })

        it("URL-safe Base64 roundtrip", () => {
            for (const bytes of vectors) {
                expect(decode(encode(bytes, true), true)).toEqual(bytes)
            }
        })
    })
})
