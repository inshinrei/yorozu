import { describe, expect, it } from "vitest"
import type { WorkspacePackage } from "../../package-json/collect-package-jsons"
import type { PackageJson } from "../../package-json/types"
import { selectChangedNpmPackages } from "./cr"

function workspacePackage(json: PackageJson, extras: Partial<WorkspacePackage> = {}): WorkspacePackage {
    return {
        path: extras.path ?? `/tmp/${json.name ?? "pkg"}`,
        packageJsonPath: extras.packageJsonPath ?? `/tmp/${json.name ?? "pkg"}/package.json`,
        root: extras.root ?? false,
        json,
    }
}

describe("selectChangedNpmPackages", () => {
    let utils = workspacePackage({ name: "@yorozu/utils", version: "0.1.0" })
    let io = workspacePackage({
        name: "@yorozu/io",
        version: "0.1.0",
        dependencies: { "@yorozu/utils": "workspace:^" },
    })
    let secret = workspacePackage({
        name: "@yorozu/secret",
        version: "0.1.0",
        yorozu: { private: true },
    })
    let npmSkip = workspacePackage({
        name: "@yorozu/docs-site",
        version: "0.1.0",
        yorozu: { npm: "skip" },
        dependencies: { "@yorozu/utils": "workspace:^" },
    })
    let jsrOnly = workspacePackage({
        name: "@yorozu/types",
        version: "0.1.0",
        yorozu: { jsr: "only" },
    })
    let publishable = [utils, io]

    it("keeps a publishable changed package", () => {
        expect(selectChangedNpmPackages({ publishable: [utils], changed: [utils] }).map(pkg => pkg.json.name)).toEqual([
            "@yorozu/utils",
        ])
    })

    it("drops private, npm skip, and jsr-only packages even when they changed", () => {
        let selected = selectChangedNpmPackages({
            publishable,
            changed: [secret, npmSkip, jsrOnly],
        })
        expect(selected).toEqual([])
    })

    it("includes publishable dependents of a changed package", () => {
        let withDependent = selectChangedNpmPackages({
            publishable,
            changed: [utils],
        })
        expect(withDependent.map(pkg => pkg.json.name).sort()).toEqual(["@yorozu/io", "@yorozu/utils"])
    })

    it("does not hand a skipped dependent to pkg-pr-new", () => {
        let selected = selectChangedNpmPackages({
            publishable: [utils, io],
            changed: [utils, npmSkip],
        })
        expect(selected.map(pkg => pkg.json.name).sort()).toEqual(["@yorozu/io", "@yorozu/utils"])
    })
})
