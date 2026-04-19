import { beforeEach, describe, expect, it } from "vitest"
import { LruMap } from "./lru-map"

describe("LruMap", () => {
    let cache: LruMap<string, number>

    beforeEach(() => {
        cache = new LruMap(3)
    })

    it("starts empty", () => {
        expect(cache.has("a")).toBe(false)
        expect(cache.get("a")).toBeUndefined()
        expect(cache.size).toBe(0)
    })

    it("set() adds items and respects capacity (evicts LRU)", () => {
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)

        expect(cache.get("a")).toBe(1)
        expect(cache.get("b")).toBe(2)
        expect(cache.get("c")).toBe(3)

        cache.set("d", 4)

        expect(cache.has("a")).toBe(false)
        expect(cache.get("a")).toBeUndefined()
        expect(cache.get("d")).toBe(4)
        expect(cache.size).toBe(3)
    })

    it("get() moves item to most recently used", () => {
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)

        cache.get("a")

        cache.set("d", 4)

        expect(cache.has("b")).toBe(false)
        expect(cache.has("a")).toBe(true)
        expect(cache.has("c")).toBe(true)
        expect(cache.has("d")).toBe(true)
    })

    it("set() on existing key updates value and moves to front", () => {
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("a", 99)

        cache.set("c", 3)
        cache.set("d", 4)

        expect(cache.get("a")).toBe(99)
        expect(cache.has("b")).toBe(false)
    })

    it("delete() removes item correctly", () => {
        cache.set("a", 1)
        cache.set("b", 2)
        cache.delete("a")

        expect(cache.has("a")).toBe(false)
        expect(cache.has("b")).toBe(true)
        expect(cache.size).toBe(1)
    })

    it("clear() empties the cache", () => {
        cache.set("a", 1)
        cache.set("b", 2)
        cache.clear()

        expect(cache.has("a")).toBe(false)
        expect(cache.has("b")).toBe(false)
        expect(cache.size).toBe(0)
        expect(cache.get("a")).toBeUndefined()
    })

    it("has() returns correct presence", () => {
        cache.set("x", 42)
        expect(cache.has("x")).toBe(true)
        expect(cache.has("y")).toBe(false)
    })

    it("capacity = 0 behaves correctly (no items stored)", () => {
        const zeroCache = new LruMap<string, number>(0)
        zeroCache.set("a", 1)
        expect(zeroCache.get("a")).toBeUndefined()
        expect(zeroCache.has("a")).toBe(false)
        expect(zeroCache.size).toBe(0)
    })

    it("capacity = 1 works as expected", () => {
        const oneCache = new LruMap<string, number>(1)
        oneCache.set("a", 10)
        expect(oneCache.get("a")).toBe(10)

        oneCache.set("b", 20)
        expect(oneCache.get("a")).toBeUndefined()
        expect(oneCache.get("b")).toBe(20)
    })

    it("get() on non-existent key returns undefined without side effects", () => {
        cache.set("a", 1)
        expect(cache.get("z")).toBeUndefined()
        expect(cache.size).toBe(1)
    })

    it("iterator is not exposed but internal order is maintained via get/set", () => {
        cache.set("a", 1)
        cache.set("b", 2)
        cache.get("a")
        cache.set("c", 3)
        cache.set("d", 4)

        expect(cache.has("b")).toBe(false)
        expect(cache.has("a")).toBe(true)
    })
})
