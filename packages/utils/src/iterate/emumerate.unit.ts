import { describe, expect, it } from "vitest"
import { enumerate } from "./enumerate"

describe("enumerate", () => {
    it("yields [index, value] pairs starting from 0", () => {
        let arr = ["a", "b", "c"]
        let result = [...enumerate(arr)]

        expect(result).toEqual([
            [0, "a"],
            [1, "b"],
            [2, "c"],
        ])
    })

    it("works with empty iterable", () => {
        let result = [...enumerate([])]
        expect(result).toEqual([])
    })

    it("works with strings (iterable of characters)", () => {
        let result = [...enumerate("abc")]
        expect(result).toEqual([
            [0, "a"],
            [1, "b"],
            [2, "c"],
        ])
    })

    it("works with Sets and other iterables", () => {
        let set = new Set(["x", "y", "z"])
        let result = [...enumerate(set)]

        expect(result.length).toBe(3)
        expect(result[0][1]).toBe("x")
        expect(result[1][1]).toBe("y")
    })

    it("is a proper iterator (has [Symbol.iterator] that returns itself)", () => {
        let iter = enumerate([10, 20, 30])

        expect(iter[Symbol.iterator]).toBeDefined()
        expect(iter[Symbol.iterator]()).toBe(iter)

        let result = [...iter]
        expect(result).toEqual([
            [0, 10],
            [1, 20],
            [2, 30],
        ])
    })

    it("consumes the original iterator exactly once", () => {
        let arr = [1, 2, 3]
        let iter = arr[Symbol.iterator]()

        let enumerated = enumerate(iter)

        expect([...enumerated]).toEqual([
            [0, 1],
            [1, 2],
            [2, 3],
        ])

        expect(iter.next().done).toBe(true)
    })

    it("handles large iterables correctly", () => {
        let large = Array.from({ length: 1000 }, (_, i) => i)
        let result = [...enumerate(large)]

        expect(result.length).toBe(1000)
        expect(result[0]).toEqual([0, 0])
        expect(result[999]).toEqual([999, 999])
    })

    it("does not modify the original iterable", () => {
        let original = [10, 20, 30]
        let copy = [...original]

        let _ = [...enumerate(original)]

        expect(original).toEqual(copy)
    })
})
