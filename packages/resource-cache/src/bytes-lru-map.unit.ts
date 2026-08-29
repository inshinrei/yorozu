import { describe, expect, it, vi } from "vitest"
import { BytesLruMap } from "./bytes-lru-map"

const sizeOf = (value: number): number => value

describe("BytesLruMap", () => {
    it("promotes on get so eviction skips the hit", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 6, sizeOf })
        expect(map.set("a", 2)).toBe(true)
        expect(map.set("b", 2)).toBe(true)
        expect(map.set("c", 2)).toBe(true)
        expect(map.get("a")).toBe(2)
        expect(map.set("d", 2)).toBe(true)
        expect(map.has("b")).toBe(false)
        expect(map.has("a")).toBe(true)
        expect(map.has("c")).toBe(true)
        expect(map.has("d")).toBe(true)
        expect(map.byteSize).toBe(6)
        expect(map.size).toBe(3)
    })

    it("replace updates byteSize by delta instead of adding", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 100, sizeOf })
        map.set("a", 10)
        map.set("b", 5)
        expect(map.byteSize).toBe(15)
        expect(map.set("a", 3)).toBe(true)
        expect(map.byteSize).toBe(8)
        expect(map.size).toBe(2)
        expect(map.get("a")).toBe(3)
    })

    it("evicts LRU when over maxBytes", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 10, sizeOf })
        map.set("old", 8)
        map.set("new", 8)
        expect(map.has("old")).toBe(false)
        expect(map.get("new")).toBe(8)
        expect(map.byteSize).toBe(8)
        expect(map.size).toBe(1)
    })

    it("evicts LRU when over maxEntries", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 1000, maxEntries: 2, sizeOf })
        map.set("a", 1)
        map.set("b", 1)
        map.set("c", 1)
        expect(map.has("a")).toBe(false)
        expect(map.has("b")).toBe(true)
        expect(map.has("c")).toBe(true)
        expect(map.size).toBe(2)
        expect(map.byteSize).toBe(2)
    })

    it("setMaxBytes shrinks immediately", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 100, sizeOf })
        map.set("a", 10)
        map.set("b", 10)
        map.set("c", 10)
        map.setMaxBytes(15)
        expect(map.maxBytes).toBe(15)
        expect(map.has("a")).toBe(false)
        expect(map.has("b")).toBe(false)
        expect(map.has("c")).toBe(true)
        expect(map.byteSize).toBe(10)
        expect(map.size).toBe(1)
    })

    it("rejects oversize insert: set returns false and map is unchanged", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 10, sizeOf })
        map.set("a", 5)
        expect(map.set("huge", 11)).toBe(false)
        expect(map.has("huge")).toBe(false)
        expect(map.get("a")).toBe(5)
        expect(map.byteSize).toBe(5)
        expect(map.size).toBe(1)
        expect(map.set("a", 11)).toBe(false)
        expect(map.get("a")).toBe(5)
        expect(map.byteSize).toBe(5)
        expect([...map]).toEqual([["a", 5]])
    })

    it("calls onEvict with key and value on LRU eviction", () => {
        let onEvict = vi.fn()
        let map = new BytesLruMap<string, number>({ maxBytes: 5, sizeOf, onEvict })
        map.set("a", 3)
        map.set("b", 3)
        expect(onEvict).toHaveBeenCalledTimes(1)
        expect(onEvict).toHaveBeenCalledWith("a", 3)
        map.setMaxBytes(2)
        expect(onEvict).toHaveBeenCalledTimes(2)
        expect(onEvict).toHaveBeenLastCalledWith("b", 3)
        expect(map.size).toBe(0)
    })

    it("iterates LRU-first", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 100, sizeOf })
        map.set("a", 1)
        map.set("b", 2)
        map.set("c", 3)
        expect([...map]).toEqual([
            ["a", 1],
            ["b", 2],
            ["c", 3],
        ])
        map.get("a")
        expect([...map].map(([key]) => key)).toEqual(["b", "c", "a"])
    })

    it("acceptOversize inserts a value larger than maxBytes", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 5, sizeOf, acceptOversize: true })
        expect(map.set("huge", 10)).toBe(true)
        expect(map.get("huge")).toBe(10)
        expect(map.byteSize).toBe(10)
        expect(map.size).toBe(1)
        map.set("small", 1)
        expect(map.has("huge")).toBe(false)
        expect(map.get("small")).toBe(1)
        expect(map.byteSize).toBe(1)
    })

    it("has does not promote", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 4, sizeOf })
        map.set("a", 2)
        map.set("b", 2)
        expect(map.has("a")).toBe(true)
        map.set("c", 2)
        expect(map.has("a")).toBe(false)
        expect(map.has("b")).toBe(true)
        expect(map.has("c")).toBe(true)
    })

    it("accepts a value equal to maxBytes", () => {
        let map = new BytesLruMap<string, number>({ maxBytes: 10, sizeOf })
        expect(map.set("a", 10)).toBe(true)
        expect(map.byteSize).toBe(10)
        expect(map.size).toBe(1)
    })

    it("delete and clear drop bytes without onEvict", () => {
        let onEvict = vi.fn()
        let map = new BytesLruMap<string, number>({ maxBytes: 100, sizeOf, onEvict })
        map.set("a", 4)
        map.set("b", 6)
        expect(map.delete("a")).toBe(true)
        expect(map.delete("a")).toBe(false)
        expect(map.byteSize).toBe(6)
        expect(map.has("a")).toBe(false)
        map.clear()
        expect(map.size).toBe(0)
        expect(map.byteSize).toBe(0)
        expect(onEvict).not.toHaveBeenCalled()
    })
})
