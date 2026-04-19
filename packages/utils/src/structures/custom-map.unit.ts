import { beforeEach, describe, expect, it } from "vitest"
import { CustomMap } from "./custom-map"

describe("CustomMap", () => {
    let map: CustomMap<string, string, string>
    let toInternal: (key: string) => string
    let fromInternal: (key: string) => string

    beforeEach(() => {
        // Use identity mapper for tests → no collisions
        toInternal = (k: string) => k
        fromInternal = (k: string) => k
        map = new CustomMap(toInternal, fromInternal)
    })

    it("constructor initializes empty map", () => {
        expect(map.size).toBe(0)
        expect(map.getInternalMap()).toBeInstanceOf(Map)
    })

    it("set() / get() / has() / delete() use mapped keys", () => {
        map.set("hello", "world")
        map.set("hi", "there")

        expect(map.size).toBe(2)
        expect(map.has("hello")).toBe(true)
        expect(map.get("hello")).toBe("world")
        expect(map.delete("hello")).toBe(true)
        expect(map.size).toBe(1)
    })

    it("forEach receives external keys", () => {
        map.set("a", "one")
        map.set("bb", "two")

        const calls: Array<[string, string]> = []
        map.forEach((value, key) => calls.push([key, value]))

        expect(calls).toEqual([
            ["a", "one"],
            ["bb", "two"],
        ])
    })

    it("clear() empties the map", () => {
        map.set("x", "y")
        map.set("zz", "w")
        map.clear()

        expect(map.size).toBe(0)
        expect(map.get("x")).toBeUndefined()
    })

    /* not supported */
    it.todo("getOrInsert and getOrInsertComputed work with mapped keys", () => {
        expect(map.getOrInsert("abc", "default")).toBe("default")
        expect(map.get("abc")).toBe("default")

        const computed = map.getOrInsertComputed("def", (k) => {
            expect(k).toBe("def")
            return "computed"
        })
        expect(computed).toBe("computed")
    })

    it("entries() returns iterator with external keys", () => {
        map.set("foo", "bar")
        map.set("baz", "qux")

        const entries = [...map.entries()]
        expect(entries).toEqual([
            ["foo", "bar"],
            ["baz", "qux"],
        ])
    })

    it("keys() returns iterator with external keys", () => {
        map.set("short", "1")
        map.set("longer", "2")

        expect([...map.keys()]).toEqual(["short", "longer"])
    })

    it("values() returns iterator with values unchanged", () => {
        map.set("a", "alpha")
        map.set("bb", "beta")
        expect([...map.values()]).toEqual(["alpha", "beta"])
    })

    it("[Symbol.iterator] delegates to entries()", () => {
        map.set("one", "1")
        map.set("two", "2")

        expect([...map]).toEqual([
            ["one", "1"],
            ["two", "2"],
        ])
    })

    it("getInternalMap() returns the raw internal map", () => {
        map.set("test", "value")
        const internal = map.getInternalMap()
        expect(internal.get("test")).toBe("value")
        expect(internal.size).toBe(1)
    })

    it("handles edge cases gracefully", () => {
        expect([...map.keys()]).toEqual([])
        expect([...map.entries()]).toEqual([])

        map.set("abc", "first")
        map.set("abc", "second")
        expect(map.get("abc")).toBe("second")
        expect(map.size).toBe(1)
    })
})
