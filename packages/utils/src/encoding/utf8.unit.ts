import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { decoder, encodedLength, encoder } from "./utf8"

describe("encoding utilities", () => {
    describe("encode and decoder singletons", () => {
        it("exports correct TextEncoder/TextDecoder instances", () => {
            expect(encoder).toBeInstanceOf(TextEncoder)
            expect(decoder).toBeInstanceOf(TextDecoder)

            expect(encoder).toBe(encoder)
            expect(decoder).toBe(decoder)
        })
    })

    describe("encodedLength", () => {
        beforeEach(() => {
            vi.stubGlobal("Buffer", undefined)
        })

        afterEach(() => {
            vi.unstubAllGlobals()
        })

        it("returns 0 for empty string", () => {
            expect(encodedLength("")).toBe(0)
        })

        it("correctly counts ASCII characters (1 byte each)", () => {
            expect(encodedLength("hello")).toBe(5)
            expect(encodedLength("abc123")).toBe(6)
        })

        it("correctly counts 2-byte UTF-8 characters", () => {
            expect(encodedLength("café")).toBe(5) // é = 2 bytes
            expect(encodedLength(" naïve")).toBe(7) // ï = 2 bytes
        })

        it("correctly counts 3-byte UTF-8 characters", () => {
            expect(encodedLength("你好")).toBe(6) // each Chinese char = 3 bytes
            expect(encodedLength("€")).toBe(3)
        })

        it("correctly counts 4-byte UTF-8 characters (emoji / surrogate pairs)", () => {
            expect(encodedLength("👍")).toBe(4)
            expect(encodedLength("👨‍👩‍👧‍👦")).toBe(25)
            expect(encodedLength("😀")).toBe(4)
        })

        it("matches native TextEncoder.byteLength for all cases", () => {
            const testCases = [
                "",
                "hello",
                "café naïve",
                "你好世界",
                "€ £ ¥",
                "👍 👨‍👩‍👧‍👦",
                "a".repeat(100) + "😀",
                "mixed ASCII + emoji: hello 👍 world",
            ]

            for (const str of testCases) {
                const manual = encodedLength(str)
                const native = new TextEncoder().encode(str).length
                expect(manual).toBe(native)
            }
        })

        it("uses native Buffer.byteLength when available (Node.js path)", () => {
            const mockBufferByteLength = vi.fn((str: string) => 42)
            vi.stubGlobal("Buffer", { byteLength: mockBufferByteLength })

            const result = encodedLength("test string")

            expect(mockBufferByteLength).toHaveBeenCalledWith("test string", "utf8")
            expect(result).toBe(42)

            vi.unstubAllGlobals()
        })

        it("handles very long strings correctly", () => {
            const long = "a".repeat(10000) + "👍"
            expect(encodedLength(long)).toBe(10000 + 4)
        })
    })
})
