import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { PackageJson } from "./types"
import { collectPackageJsons, filterPackageJsonsForPublish, type WorkspacePackage } from "./collect-package-jsons"
import { collectVersions, findPackageByName, findRootPackage } from "./utils"

let fixtureRoot = new URL("../__fixtures__/pnpm-workspace", import.meta.url)

function workspacePackage(json: PackageJson, extras: Partial<WorkspacePackage> = {}): WorkspacePackage {
    return {
        path: extras.path ?? "/tmp/pkg",
        packageJsonPath: extras.packageJsonPath ?? "/tmp/pkg/package.json",
        root: extras.root ?? false,
        json,
    }
}

describe("collectPackageJsons", () => {
    it("collects package.jsons from a pnpm workspace and skips non-package dirs", async () => {
        let packages = await collectPackageJsons(fixtureRoot)
        let names = packages.map(pkg => pkg.json.name)

        expect(names).toContain("@yorozu-fixtures/package-a")
        expect(names).toContain("@yorozu-fixtures/package-b")
        expect(names).toHaveLength(2)
        expect(packages.every(pkg => !pkg.root)).toBe(true)
    })

    it("includes the root package.json when includeRoot is true and attaches catalogs", async () => {
        let packages = await collectPackageJsons(fixtureRoot, true)
        let root = packages.find(pkg => pkg.root)

        expect(root).toBeDefined()
        expect(root!.json.name).toBe("@yorozu-fixtures/workspace")
        expect(root!.json.workspaces).toEqual(["packages/*"])
        expect(root!.json.catalogs).toEqual({
            "": { zod: "4.3.6" },
            frontend: { react: "19.0.0" },
        })
        expect(root!.packageJsonPath).toBe(
            fileURLToPath(new URL("../__fixtures__/pnpm-workspace/package.json", import.meta.url)),
        )
        expect(packages).toHaveLength(3)
    })

    it("throws if no workspaces are found", async () => {
        await expect(
            collectPackageJsons(new URL("../__fixtures__/pnpm-workspace/packages/package-a", import.meta.url)),
        ).rejects.toThrow("No workspaces found in package.json")
    })
})

describe("filterPackageJsonsForPublish", () => {
    let root = workspacePackage({ name: "root", version: "0.0.0" }, { root: true })
    let plain = workspacePackage({ name: "plain", version: "1.0.0" })
    let privatePkg = workspacePackage({ name: "secret", version: "1.0.0", yorozu: { private: true } })
    let npmSkip = workspacePackage({ name: "npm-skip", version: "1.0.0", yorozu: { npm: "skip" } })
    let jsrOnly = workspacePackage({ name: "jsr-only", version: "1.0.0", yorozu: { jsr: "only" } })
    let npmOnly = workspacePackage({ name: "npm-only", version: "1.0.0", yorozu: { npm: "only" } })

    it("drops the root package and yorozu.private / skip / other-registry-only packages", () => {
        let npm = filterPackageJsonsForPublish([root, plain, privatePkg, npmSkip, jsrOnly, npmOnly], "npm")
        expect(npm.map(pkg => pkg.json.name)).toEqual(["plain", "npm-only"])

        let jsr = filterPackageJsonsForPublish([root, plain, privatePkg, npmSkip, jsrOnly, npmOnly], "jsr")
        expect(jsr.map(pkg => pkg.json.name)).toEqual(["plain", "npm-skip", "jsr-only"])
    })
})

describe("workspace package utils", () => {
    it("collectVersions returns a Map of non-root named versions", () => {
        let versions = collectVersions([
            workspacePackage({ name: "root", version: "9.9.9" }, { root: true }),
            workspacePackage({ name: "a", version: "1.0.0" }),
            workspacePackage({ name: "b", version: "2.0.0" }),
            workspacePackage({ name: "no-version" }),
            workspacePackage({ version: "3.0.0" }),
        ])

        expect(versions).toBeInstanceOf(Map)
        expect([...versions.entries()]).toEqual([
            ["a", "1.0.0"],
            ["b", "2.0.0"],
        ])
    })

    it("findPackageByName and findRootPackage locate packages or throw", () => {
        let root = workspacePackage({ name: "root", version: "0.0.0" }, { root: true })
        let a = workspacePackage({ name: "a", version: "1.0.0" })
        let packages = [root, a]

        expect(findPackageByName(packages, "a")).toBe(a)
        expect(findRootPackage(packages)).toBe(root)
        expect(() => findPackageByName(packages, "missing")).toThrow("Could not find package.json for missing")
        expect(() => findRootPackage([a])).toThrow("Could not find package.json for workspace root")
    })
})
