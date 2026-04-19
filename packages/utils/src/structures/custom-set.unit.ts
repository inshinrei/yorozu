import { beforeEach, describe, expect, it } from "vitest"
import { CustomSet } from "./custom-set"

describe("CustomSet", () => {
    let set: CustomSet<string, string>
    let toInternal: (k: string) => string
    let fromInternal: (k: string) => string

    beforeEach(() => {
        toInternal = (k) => k
        fromInternal = (k) => k
        set = new CustomSet(toInternal, fromInternal)
    })

    it("add / has / delete / size work with mapped keys", () => {
        set.add("hi")
        set.add("hello")
        expect(set.size).toBe(2)
        expect(set.has("hi")).toBe(true)
        expect(set.delete("hi")).toBe(true)
        expect(set.size).toBe(1)
    })

    it("forEach receives external keys", () => {
        set.add("a")
        set.add("bb")
        const calls: string[] = []
        set.forEach((v) => calls.push(v))
        expect(calls).toEqual(["a", "bb"])
    })

    it("clear empties the set", () => {
        set.add("x")
        set.add("yy")
        set.clear()
        expect(set.size).toBe(0)
    })

    it("entries(), keys(), values() return external keys", () => {
        set.add("foo")
        set.add("baz")

        expect([...set.entries()]).toEqual([
            ["foo", "foo"],
            ["baz", "baz"],
        ])
        expect([...set.keys()]).toEqual(["foo", "baz"])
        expect([...set.values()]).toEqual(["foo", "baz"])
    })

    it("[Symbol.iterator] delegates to keys()", () => {
        set.add("one")
        set.add("two")
        expect([...set]).toEqual(["one", "two"])
    })

    it("getInternalSet returns raw internal Set", () => {
        set.add("test")
        expect(set.getInternalSet().has("test")).toBe(true)
    })

    it("union returns new CustomSet with combined elements", () => {
        set.add("hi")
        const other = new Set(["hello", "world"])
        const result = set.union(other)
        expect([...result]).toEqual(["hi", "hello", "world"])
    })

    it("intersection returns common elements", () => {
        set.add("hello")
        set.add("world")
        const other = new Set(["hello", "foo"])
        const result = set.intersection(other)
        expect([...result]).toEqual(["hello"])
    })

    it("difference returns elements not in other", () => {
        set.add("a")
        set.add("bb")
        const other = new Set(["bb"])
        const result = set.difference(other)
        expect([...result]).toEqual(["a"])
    })

    it("symmetricDifference returns elements in exactly one set", () => {
        set.add("a")
        set.add("bb")
        const other = new Set(["bb", "ccc"])
        const result = set.symmetricDifference(other)
        expect([...result]).toEqual(["a", "ccc"])
    })

    it("isSubsetOf / isSupersetOf / isDisjointFrom work correctly", () => {
        set.add("hello")
        set.add("world")

        const other = new Set(["hello", "world", "extra"])
        expect(set.isSubsetOf(other)).toBe(true)
        expect(set.isSupersetOf(new Set(["hello"]))).toBe(true)
        expect(set.isDisjointFrom(new Set(["foo"]))).toBe(true)
    })
})
