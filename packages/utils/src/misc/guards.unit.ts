import { describe, expect, it } from "vitest"
import {
    isBigInt,
    isBoolean,
    isFalsy,
    isFunction,
    isNotNull,
    isNotUndefined,
    isNumber,
    isObject,
    isString,
    isSymbol,
    isTruthy
} from "./guards"

describe("type guards", () => {
    it("isNotUndefined", () => {
        expect(isNotUndefined(undefined)).toBe(false)
        expect(isNotUndefined(null)).toBe(true)
        expect(isNotUndefined(0)).toBe(true)
        expect(isNotUndefined("")).toBe(true)
        expect(isNotUndefined(false)).toBe(true)

        const x: unknown = "hello"
        if (isNotUndefined(x)) {
            expect(typeof x).toBe("string")
        }
    })

    it("isNotNull", () => {
        expect(isNotNull(null)).toBe(false)
        expect(isNotNull(undefined)).toBe(true)
        expect(isNotNull(0)).toBe(true)
        expect(isNotNull("")).toBe(true)

        const x: unknown = {}
        if (isNotNull(x)) {
            expect(x).not.toBeNull()
        }
    })

    it("isBoolean", () => {
        expect(isBoolean(true)).toBe(true)
        expect(isBoolean(false)).toBe(true)
        expect(isBoolean(1)).toBe(false)
        expect(isBoolean("true")).toBe(false)
        expect(isBoolean(null)).toBe(false)
        expect(isBoolean(undefined)).toBe(false)
    })

    it("isTruthy / isFalsy", () => {
        const truthyValues = [true, 1, "hello", {}, [], new Date(), Symbol("test"), BigInt(1)]
        const falsyValues = [false, 0, "", null, undefined, NaN]

        for (const v of truthyValues) {
            expect(isTruthy(v)).toBe(true)
            expect(isFalsy(v)).toBe(false)
        }

        for (const v of falsyValues) {
            expect(isFalsy(v)).toBe(true)
            expect(isTruthy(v)).toBe(false)
        }
    })

    it("isFunction", () => {
        expect(isFunction(() => {})).toBe(true)
        expect(isFunction(async () => {})).toBe(true)
        expect(isFunction(function () {})).toBe(true)
        expect(isFunction(class {})).toBe(true)

        expect(isFunction(42)).toBe(false)
        expect(isFunction("")).toBe(false)
        expect(isFunction(null)).toBe(false)
        expect(isFunction(undefined)).toBe(false)
        expect(isFunction({})).toBe(false)
    })

    it("isNumber", () => {
        expect(isNumber(42)).toBe(true)
        expect(isNumber(0)).toBe(true)
        expect(isNumber(NaN)).toBe(true)
        expect(isNumber(Infinity)).toBe(true)

        expect(isNumber("42")).toBe(false)
        expect(isNumber(null)).toBe(false)
        expect(isNumber(undefined)).toBe(false)
    })

    it("isString", () => {
        expect(isString("")).toBe(true)
        expect(isString("hello")).toBe(true)

        expect(isString(42)).toBe(false)
        expect(isString(null)).toBe(false)
        expect(isString(undefined)).toBe(false)
        expect(isString({})).toBe(false)
    })

    it("isSymbol", () => {
        expect(isSymbol(Symbol("test"))).toBe(true)
        expect(isSymbol(Symbol.iterator)).toBe(true)

        expect(isSymbol("")).toBe(false)
        expect(isSymbol(42)).toBe(false)
    })

    it("isBigInt", () => {
        expect(isBigInt(BigInt(42))).toBe(true)
        expect(isBigInt(0n)).toBe(true)

        expect(isBigInt(42)).toBe(false)
        expect(isBigInt("42")).toBe(false)
    })

    it("isObject", () => {
        expect(isObject({})).toBe(true)
        expect(isObject([])).toBe(true)
        expect(isObject(new Date())).toBe(true)
        expect(isObject(/regex/)).toBe(true)
        expect(isObject(Object.create(null))).toBe(true)

        expect(isObject(null)).toBe(false)
        expect(isObject(undefined)).toBe(false)
        expect(isObject(42)).toBe(false)
        expect(isObject("")).toBe(false)
        expect(isObject(true)).toBe(false)
    })

    it("type narrowing works correctly in control flow", () => {
        const value: unknown = "test string"

        if (isString(value)) {
            expect(value.toUpperCase()).toBe("TEST STRING")
        }

        if (isNumber(value)) {
            expect(value.toFixed()).toBeDefined()
        }

        if (isFunction(value)) {
            value()
        }

        if (isObject(value)) {
            expect(typeof value).toBe("object")
        }
    })
})
