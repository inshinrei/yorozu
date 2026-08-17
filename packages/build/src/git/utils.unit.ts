import { describe, expect, it } from "vitest"
import { parseConventionalCommit } from "./utils"

describe("parseConventionalCommit", () => {
    it("parses feat: without a scope", () => {
        expect(parseConventionalCommit("feat: add publish order")).toEqual({
            type: "feat",
            breaking: false,
            subject: "add publish order",
        })
    })

    it("parses feat(scope):", () => {
        expect(parseConventionalCommit("feat(build): add publish order")).toEqual({
            type: "feat",
            scope: "build",
            breaking: false,
            subject: "add publish order",
        })
    })

    it("parses feat!: as breaking", () => {
        expect(parseConventionalCommit("feat!: drop node 18")).toEqual({
            type: "feat",
            breaking: true,
            subject: "drop node 18",
        })
    })

    it("parses feat(scope)!: as breaking with a scope", () => {
        expect(parseConventionalCommit("feat(api)!: rename hook context")).toEqual({
            type: "feat",
            scope: "api",
            breaking: true,
            subject: "rename hook context",
        })
    })

    it("marks a commit breaking when the body has a BREAKING CHANGE footer", () => {
        expect(
            parseConventionalCommit("feat: change the release tag schema\n\nBREAKING CHANGE: tags are now vX.Y.Z"),
        ).toEqual({
            type: "feat",
            breaking: true,
            subject: "change the release tag schema",
        })
    })

    it("marks a commit breaking when the footer uses BREAKING-CHANGE", () => {
        expect(parseConventionalCommit("fix: align versions\n\nBREAKING-CHANGE: dependents must bump")).toEqual({
            type: "fix",
            breaking: true,
            subject: "align versions",
        })
    })

    it("returns null for a non-conventional subject", () => {
        expect(parseConventionalCommit("just a regular commit")).toBeNull()
    })
})
