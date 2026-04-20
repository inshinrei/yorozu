import { describe, expect, it } from "vitest"
import { clearUndefinedInPlace, deepMerge, objectEntries, objectKeys } from "./objects"

describe("deep merge utilities", () => {
    describe("objectKeys", () => {
        it("returns string keys with correct literal types", () => {
            const obj = { a: 1, b: "test", 123: true } as const
            const keys = objectKeys(obj)

            expect(keys).toEqual(["123", "a", "b"])
            expect(keys[0]).toBe("123")
        })
    })

    describe("objectEntries", () => {
        it("returns typed entries", () => {
            const obj = { a: 1, b: "test" } as const
            const entries = objectEntries(obj)
            expect(entries).toEqual([
                ["a", 1],
                ["b", "test"],
            ])
        })
    })

    describe("clearUndefinedInPlace", () => {
        it("removes undefined properties in place", () => {
            const obj = { a: 1, b: undefined, c: "hello", d: undefined } as any
            clearUndefinedInPlace(obj)
            expect(obj).toEqual({ a: 1, c: "hello" })
        })
    })

    describe("deepMerge", () => {
        it("merges simple objects (default behavior)", () => {
            const into = { a: 1, b: 2 }
            const result = deepMerge(into, { b: 99, c: 3 })
            expect(result).toEqual({ a: 1, b: 99, c: 3 })
        })

        it("supports multiple sources (MaybeArray)", () => {
            const result = deepMerge({ a: 1 }, [{ b: 2 }, { c: 3 }])
            expect(result).toEqual({ a: 1, b: 2, c: 3 })
        })

        it('undefined strategy: "ignore" (default) vs "replace"', () => {
            const into = { a: 1, b: 2 }
            let r1 = deepMerge(into, { a: undefined, c: 3 })
            expect(r1).toEqual({ a: 1, b: 2, c: 3 })

            let r2 = deepMerge(into, { a: undefined, c: 3 }, { undefined: "replace" })
            expect(r2).toEqual({ a: undefined, b: 2, c: 3 })
        })

        it('properties strategy: "replace" (default) vs "ignore"', () => {
            const into = { a: 1 }
            let r1 = deepMerge(into, { a: 99 }, { properties: "ignore" })
            expect(r1.a).toBe(1)

            let r2 = deepMerge(into, { a: 99 }, { properties: "replace" })
            expect(r2.a).toBe(99)
        })

        it('arrays strategy: "replace" (default), "ignore", "merge"', () => {
            const into = { arr: [1, 2] }

            expect(deepMerge(into, { arr: [3, 4] }).arr).toEqual([3, 4])
            // expect(deepMerge(into, { arr: [3, 4] }, { arrays: "ignore" }).arr).toEqual([1, 2])
            // expect(deepMerge(into, { arr: [3, 4] }, { arrays: "merge" }).arr).toEqual([1, 2, 3, 4])
        })

        it('objects strategy: "merge" (default), "replace", "ignore"', () => {
            const into = { nested: { x: 1, y: 2 } }

            expect(deepMerge(into, { nested: { y: 99, z: 3 } }).nested).toEqual({ x: 1, y: 99, z: 3 })
            expect(deepMerge(into, { nested: { y: 99, z: 3 } }, { objects: "replace" }).nested).toEqual({ y: 99, z: 3 })
            // expect(deepMerge(into, { nested: { y: 99 } }, { objects: "ignore" }).nested).toEqual({ x: 1, y: 2 })
        })

        it("handles nested objects recursively", () => {
            const into = { a: { b: { c: 1 } } }
            const result = deepMerge(into, { a: { b: { d: 2 }, e: 3 } })
            expect(result).toEqual({ a: { b: { c: 1, d: 2 }, e: 3 } })
        })

        it("deepMerge type is correctly inferred", () => {
            interface A {
                a: number
                shared?: string
            }
            interface B {
                b: string
                shared: number
            }

            const result = deepMerge({} as A, {} as B)
            expect(result.a).toBeUndefined()
            expect(result.b).toBeUndefined()
            expect(result.shared).toBeUndefined()
        })

        it("empty from array returns original object", () => {
            const obj = { a: 1 }
            const result = deepMerge(obj, [])
            expect(result).toBe(obj)
        })
    })
})
