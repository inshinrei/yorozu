import { beforeEach, describe, expect, it, vi } from "vitest"
import { reverse, toReversed } from "./reverse"
import { allocate } from "./pool"

vi.mock("./pool", () => ({
    allocate: vi.fn((size: number) => new Uint8Array(size)),
}))

const mockAllocate = vi.mocked(allocate)

describe("reverse", () => {
    it("reverses Uint8Array in-place (even length)", () => {
        let buf = new Uint8Array([1, 2, 3, 4])
        reverse(buf)
        expect(buf).toEqual(new Uint8Array([4, 3, 2, 1]))
    })

    it("reverses Uint8Array in-place (odd length)", () => {
        let buf = new Uint8Array([10, 20, 30, 40, 50])
        reverse(buf)
        expect(buf).toEqual(new Uint8Array([50, 40, 30, 20, 10]))
    })

    it("does nothing for length < 2", () => {
        let empty = new Uint8Array([])
        let single = new Uint8Array([99])

        reverse(empty)
        reverse(single)

        expect(empty).toEqual(new Uint8Array([]))
        expect(single).toEqual(new Uint8Array([99]))
    })

    it("mutates original buffer (zero allocation)", () => {
        let original = new Uint8Array([1, 2, 3])
        let reference = original
        reverse(original)
        expect(reference).toBe(original)
        expect(Array.from(original)).toEqual([3, 2, 1])
    })
})

describe("toReversed", () => {
    beforeEach(() => {
        mockAllocate.mockClear()
    })

    it("returns reversed copy and calls allocate exactly once", () => {
        let input = [10, 20, 30, 40]
        let result = toReversed(input)

        expect(mockAllocate).toHaveBeenCalledTimes(1)
        expect(mockAllocate).toHaveBeenCalledWith(4)
        expect(result).toEqual(new Uint8Array([40, 30, 20, 10]))
    })

    it("handles empty ArrayLike with early exit", () => {
        let result = toReversed([])
        expect(mockAllocate).toHaveBeenCalledWith(0)
        expect(result).toEqual(new Uint8Array([]))
    })

    it("handles single-element ArrayLike with early exit", () => {
        let result = toReversed([99])
        expect(mockAllocate).toHaveBeenCalledWith(1)
        expect(result).toEqual(new Uint8Array([99]))
    })

    it("accepts Uint8Array as input", () => {
        let input = new Uint8Array([5, 6, 7])
        let result = toReversed(input)
        expect(result).toEqual(new Uint8Array([7, 6, 5]))
    })

    it("works with regular arrays and non-zero length", () => {
        let result = toReversed([1, 2, 3, 4, 5])
        expect(result).toEqual(new Uint8Array([5, 4, 3, 2, 1]))
    })
})
