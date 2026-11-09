import { describe, expect, it } from "vitest"
import { prepareRelease } from "./release"

describe("prepareRelease", () => {
    it("uses the current workspace version for the first release", () => {
        expect(
            prepareRelease({
                prevTag: null,
                currentVersion: "1.0.159",
                commitsSincePrevTag: [],
            }),
        ).toEqual({
            action: "release",
            version: "1.0.159",
            changelogKind: "initial",
        })
    })

    it("skips when a previous tag exists and there are no commits since it", () => {
        expect(
            prepareRelease({
                prevTag: "v1.0.150",
                currentVersion: "1.0.150",
                commitsSincePrevTag: [],
            }),
        ).toEqual({
            action: "skip",
            message: "no commits since v1.0.150, nothing to do",
        })
    })

    it("uses the current workspace version when there are commits since the previous tag", () => {
        expect(
            prepareRelease({
                prevTag: "v1.0.150",
                currentVersion: "1.0.159",
                commitsSincePrevTag: [{ hash: "abc" }],
            }),
        ).toEqual({
            action: "release",
            version: "1.0.159",
            changelogKind: "generate",
        })
    })

    it("does not increment the current workspace version", () => {
        let plan = prepareRelease({
            prevTag: "v1.0.150",
            currentVersion: "1.0.159",
            commitsSincePrevTag: [{ hash: "abc" }],
        })
        expect(plan).toMatchObject({ action: "release", version: "1.0.159" })
        expect(plan.action === "release" ? plan.version : "").not.toBe("1.0.160")
    })
})
