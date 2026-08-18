import { describe, expect, it } from "vitest"
import { sharedWorkspaceBumpOptions } from "./bump-version"

describe("sharedWorkspaceBumpOptions", () => {
    it("always bumps the shared root version and every managed package", () => {
        expect(sharedWorkspaceBumpOptions({ type: "auto" })).toEqual({
            type: undefined,
            withRoot: true,
            all: true,
            dryRun: undefined,
        })
    })

    it("forwards an explicit kind and dry-run", () => {
        expect(sharedWorkspaceBumpOptions({ type: "minor", dryRun: true })).toEqual({
            type: "minor",
            withRoot: true,
            all: true,
            dryRun: true,
        })
    })
})
