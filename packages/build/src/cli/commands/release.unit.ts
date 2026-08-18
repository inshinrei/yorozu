import { describe, expect, it } from "vitest"
import { shouldSkipAutoRelease } from "./release"

describe("shouldSkipAutoRelease", () => {
    it("skips auto when a previous tag exists and there are no commits since it", () => {
        expect(
            shouldSkipAutoRelease({
                kind: "auto",
                prevTag: "v0.1.0",
                commitsSincePrevTag: [],
            }),
        ).toBe(true)
    })

    it("does not skip auto when there are commits since the previous tag", () => {
        expect(
            shouldSkipAutoRelease({
                kind: "auto",
                prevTag: "v0.1.0",
                commitsSincePrevTag: [{ hash: "abc" }],
            }),
        ).toBe(false)
    })

    it("does not skip the first release even with no commits", () => {
        expect(
            shouldSkipAutoRelease({
                kind: "auto",
                prevTag: null,
                commitsSincePrevTag: [],
            }),
        ).toBe(false)
    })

    it("does not skip an explicit kind even with no commits since the previous tag", () => {
        for (let kind of ["patch", "minor", "major"]) {
            expect(
                shouldSkipAutoRelease({
                    kind,
                    prevTag: "v0.1.0",
                    commitsSincePrevTag: [],
                }),
            ).toBe(false)
        }
    })
})
