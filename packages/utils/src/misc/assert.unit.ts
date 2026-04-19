import { describe, expect, it } from "vitest"
import { unsafeCastType } from "./assert"
import { Brand } from "../types/brand"

describe("unsafeCastType", () => {
    it("never throws for any runtime value", () => {
        expect(() => unsafeCastType<string>("hello")).not.toThrow()
        expect(() => unsafeCastType<number>(42)).not.toThrow()
        expect(() => unsafeCastType<object>({})).not.toThrow()
        expect(() => unsafeCastType<null>(null)).not.toThrow()
        expect(() => unsafeCastType<undefined>(undefined)).not.toThrow()
        expect(() => unsafeCastType<unknown>(Symbol("test"))).not.toThrow()
    })

    it("narrows unknown to a concrete type", () => {
        const value: unknown = "hello world"

        unsafeCastType<string>(value)

        expect(typeof value).toBe("string")
        expect(value.toUpperCase()).toBe("HELLO WORLD")
    })

    it("narrows to complex types (objects, arrays, unions)", () => {
        const value: unknown = { id: 123, name: "test" }

        unsafeCastType<{ id: number; name: string }>(value)

        expect(value.id).toBe(123)
        expect(value.name).toBe("test")
    })

    it("works with branded types", () => {
        type UserId = Brand<number, "UserId">

        const value: unknown = 42

        unsafeCastType<UserId>(value)

        const id: UserId = value
        expect(id).toBe(42)
    })

    it("narrows union types correctly", () => {
        const value: unknown = 123

        unsafeCastType<string | number>(value)

        if (typeof value === "string") {
            expect(value.toUpperCase()).toBeDefined()
        } else {
            expect(value).toBe(123)
        }
    })

    it("can be used in control-flow narrowing scenarios", () => {
        function process(value: unknown) {
            if (typeof value === "string") {
                unsafeCastType<string>(value)
                return value.length
            }
            unsafeCastType<number>(value)
            return value * 2
        }

        expect(process("hello")).toBe(5)
        expect(process(21)).toBe(42)
    })

    it("is a true no-op at runtime (no side effects)", () => {
        let sideEffect = 0
        const increment = () => sideEffect++

        const value: unknown = 42
        unsafeCastType<number>(value)
        increment()

        expect(sideEffect).toBe(1)
        expect(value).toBe(42)
    })
})
