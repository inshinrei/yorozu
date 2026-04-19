import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { maybeWrapIterator, resetIteratorDetectionForTests } from "./_iterator"

describe("maybeWrapIterator", () => {
    let originalIterator: IterableIterator<number>

    beforeEach(() => {
        resetIteratorDetectionForTests()
        originalIterator = [10, 20, 30][Symbol.iterator]()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("returns the exact same iterator when Iterator.from is not available", () => {
        const originalIteratorCtor = globalThis.Iterator
        vi.stubGlobal("Iterator", undefined)

        const result = maybeWrapIterator(originalIterator)

        expect(result).toBe(originalIterator)

        if (originalIteratorCtor) vi.stubGlobal("Iterator", originalIteratorCtor)
    })

    it("uses Iterator.from when available (modern environments)", () => {
        const mockFrom = vi.fn((it: IterableIterator<any>) => it)
        const originalIteratorCtor = globalThis.Iterator

        vi.stubGlobal("Iterator", { from: mockFrom })

        const result = maybeWrapIterator(originalIterator)

        expect(mockFrom).toHaveBeenCalledTimes(1)
        expect(result).toBe(originalIterator)

        if (originalIteratorCtor) vi.stubGlobal("Iterator", originalIteratorCtor)
    })

    it("preserves iterator behavior and yields correct values", () => {
        const wrapped = maybeWrapIterator(originalIterator)
        expect([...wrapped]).toEqual([10, 20, 30])
    })

    it("works with empty iterator", () => {
        const empty = [][Symbol.iterator]()
        const wrapped = maybeWrapIterator(empty)
        expect([...wrapped]).toEqual([])
    })

    it("works with non-array iterables", () => {
        const set = new Set([1, 2, 3])
        const wrapped = maybeWrapIterator(set.values())
        expect([...wrapped]).toEqual([1, 2, 3])
    })
})
