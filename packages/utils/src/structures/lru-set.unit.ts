import { beforeEach, describe, expect, it } from "vitest"
import { LruSet } from "./lru-set"

describe("LruSet", () => {
    let set: LruSet<string>

    beforeEach(() => {
        set = new LruSet(3)
    })

    it("starts empty", () => {
        expect(set.size).toBe(0)
        expect(set.has("a")).toBe(false)
    })

    it("add() inserts new values and increases size", () => {
        set.add("a")
        set.add("b")
        set.add("c")

        expect(set.size).toBe(3)
        expect(set.has("a")).toBe(true)
        expect(set.has("b")).toBe(true)
        expect(set.has("c")).toBe(true)
    })

    it("add() on existing value does nothing (no reordering)", () => {
        set.add("a")
        set.add("b")
        set.add("a")

        expect(set.size).toBe(2)
        expect(set.has("a")).toBe(true)
    })

    it("when full, add() evicts the oldest element (FIFO)", () => {
        set.add("a")
        set.add("b")
        set.add("c")
        set.add("d")

        expect(set.size).toBe(3)
        expect(set.has("a")).toBe(false)
        expect(set.has("b")).toBe(true)
        expect(set.has("c")).toBe(true)
        expect(set.has("d")).toBe(true)
    })

    it("multiple adds beyond capacity keep evicting oldest", () => {
        set.add("1")
        set.add("2")
        set.add("3")
        set.add("4")
        set.add("5")

        expect(set.size).toBe(3)
        expect(set.has("1")).toBe(false)
        expect(set.has("2")).toBe(false)
        expect(set.has("3")).toBe(true)
        expect(set.has("4")).toBe(true)
        expect(set.has("5")).toBe(true)
    })

    it("clear() empties the set", () => {
        set.add("a")
        set.add("b")
        set.clear()

        expect(set.size).toBe(0)
        expect(set.has("a")).toBe(false)
        expect(set.has("b")).toBe(false)
    })

    it("capacity = 0 stores nothing", () => {
        const zeroSet = new LruSet<string>(0)
        zeroSet.add("x")
        expect(zeroSet.size).toBe(0)
        expect(zeroSet.has("x")).toBe(false)
    })

    it("capacity = 1 works as expected", () => {
        const oneSet = new LruSet<string>(1)
        oneSet.add("first")
        expect(oneSet.size).toBe(1)
        expect(oneSet.has("first")).toBe(true)

        oneSet.add("second")
        expect(oneSet.size).toBe(1)
        expect(oneSet.has("first")).toBe(false)
        expect(oneSet.has("second")).toBe(true)
    })

    it("add() after clear() works normally", () => {
        set.add("a")
        set.clear()
        set.add("b")

        expect(set.size).toBe(1)
        expect(set.has("b")).toBe(true)
    })
})
