import { describe, expect, it } from "vitest"
import { assertsEndsWith, assertStartsWith, splitOnce } from "./string"

describe("string utilities", () => {
    describe("splitOnce", () => {
        it("splits on first occurrence of separator", () => {
            expect(splitOnce("a=b=c", "=")).toEqual(["a", "b=c"])
            expect(splitOnce("hello-world", "-")).toEqual(["hello", "world"])
            expect(splitOnce("prefix:suffix:extra", ":")).toEqual(["prefix", "suffix:extra"])
        })

        it("throws RangeError when separator is not found", () => {
            expect(() => splitOnce("hello", "=")).toThrow(RangeError)
            expect(() => splitOnce("hello", "=")).toThrow("Separator not found: =")

            expect(() => splitOnce("", "x")).toThrow(RangeError)
        })

        it("does not throws on empty separator", () => {
            expect(() => splitOnce("hello", "")).not.toThrow(RangeError)
        })

        it("handles edge cases correctly", () => {
            expect(splitOnce("abc", "b")).toEqual(["a", "c"])
            expect(splitOnce("abc", "a")).toEqual(["", "bc"])
            expect(splitOnce("abc", "c")).toEqual(["ab", ""])
        })
    })

    describe("assertStartsWith", () => {
        it("passes and narrows type when prefix matches", () => {
            let str = "hello world"

            assertStartsWith(str, "hello")

            expect(str.startsWith("hello")).toBe(true)
            expect(str).toBe("hello world")
        })

        it("throws TypeError when prefix does not match", () => {
            expect(() => assertStartsWith("hello world", "world")).toThrow(TypeError)
            expect(() => assertStartsWith("hello world", "world")).toThrow("String does not starts with world")
        })

        it("works with empty prefix", () => {
            let str = "hello"
            assertStartsWith(str, "")
            expect(str).toBe("hello")
        })
    })

    describe("assertsEndsWith", () => {
        it("passes and narrows type when suffix matches", () => {
            let str = "hello world"

            assertsEndsWith(str, "world")

            expect(str.endsWith("world")).toBe(true)
            expect(str).toBe("hello world")
        })

        it("throws TypeError when suffix does not match", () => {
            expect(() => assertsEndsWith("hello world", "hello")).toThrow(TypeError)
            expect(() => assertsEndsWith("hello world", "hello")).toThrow("String does not ends with hello")
        })

        it("works with empty suffix", () => {
            let str = "hello"
            assertsEndsWith(str, "")
            expect(str).toBe("hello")
        })
    })

    describe("type narrowing behavior", () => {
        it("assertStartsWith narrows the type correctly", () => {
            let value: string = "https://example.com"

            assertStartsWith(value, "https://")

            expect(value.startsWith("https://")).toBe(true)
        })

        it("assertsEndsWith narrows the type correctly", () => {
            let value: string = "file.json"

            assertsEndsWith(value, ".json")

            expect(value.endsWith(".json")).toBe(true)
        })
    })
})
