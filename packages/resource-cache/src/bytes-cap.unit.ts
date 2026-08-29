import { describe, expect, it } from "vitest"
import { pickOldestOverBytesCap, pickOldestOverBytesCapOrdered } from "./bytes-cap"

function item(key: string, storedAt: number, bytes: number) {
    return { key, storedAt, bytes }
}

describe("pickOldestOverBytesCap", () => {
    it("returns empty when sum is under or equal to cap", () => {
        expect(pickOldestOverBytesCap([item("a", 1, 10), item("b", 2, 10)], 20)).toEqual([])
        expect(pickOldestOverBytesCap([item("a", 1, 10)], 10)).toEqual([])
        expect(pickOldestOverBytesCap([], 100)).toEqual([])
    })

    it("drops oldest first until remaining bytes <= cap", () => {
        expect(pickOldestOverBytesCap([item("old", 1, 8), item("mid", 2, 8), item("new", 3, 8)], 10)).toEqual([
            "old",
            "mid",
        ])
    })

    it("ignores zero-byte items and still trims blobs", () => {
        expect(pickOldestOverBytesCap([item("meta", 0, 0), item("old", 1, 10), item("new", 2, 10)], 10)).toEqual([
            "old",
        ])
    })

    it("drops a single item larger than cap", () => {
        expect(pickOldestOverBytesCap([item("huge", 1, 50)], 10)).toEqual(["huge"])
    })

    it("capBytes <= 0 drops every positive-byte item", () => {
        expect(pickOldestOverBytesCap([item("a", 1, 5), item("z", 2, 0)], 0)).toEqual(["a"])
        expect(pickOldestOverBytesCap([item("a", 1, 5)], -1)).toEqual(["a"])
    })
})

describe("pickOldestOverBytesCapOrdered", () => {
    it("returns empty when totalBytes is under or equal to cap without looking at order", () => {
        expect(pickOldestOverBytesCapOrdered([item("a", 1, 10), item("b", 2, 10)], 20, 20)).toEqual([])
    })

    it("drops from the given order (does not sort)", () => {
        // newest listed first — caller promised oldest-first; this proves we do not re-sort
        expect(pickOldestOverBytesCapOrdered([item("new", 9, 8), item("old", 1, 8)], 16, 10)).toEqual(["new"])
    })

    it("skips zero-byte items while dropping", () => {
        expect(
            pickOldestOverBytesCapOrdered([item("meta", 1, 0), item("old", 2, 10), item("new", 3, 10)], 20, 10),
        ).toEqual(["old"])
    })

    it("capBytes <= 0 drops every positive-byte item in order", () => {
        expect(pickOldestOverBytesCapOrdered([item("a", 1, 5), item("z", 2, 0)], 5, 0)).toEqual(["a"])
    })
})
