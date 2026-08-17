import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { CommitInfo } from "../git/utils"
import { exec } from "../misc/exec"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { PackageJson } from "../package-json/types"
import { bumpVersion, determineBumpType } from "./bump-version"

async function git(cwd: string, args: Array<string>): Promise<string> {
    let res = await exec(["git", ...args], { cwd, throwOnError: true })
    return res.stdout.trim()
}

function workspacePackage(json: PackageJson, extras: Partial<WorkspacePackage> = {}): WorkspacePackage {
    let name = json.name ?? "pkg"
    return {
        path: extras.path ?? `/tmp/${name}`,
        packageJsonPath: extras.packageJsonPath ?? `/tmp/${name}/package.json`,
        root: extras.root ?? false,
        json,
    }
}

function lockedWorkspace() {
    let root = workspacePackage({ name: "yorozu", version: "0.1.0" }, { root: true, path: "/tmp/ws" })
    let utils = workspacePackage({ name: "@yorozu/utils", version: "0.1.0" }, { path: "/tmp/ws/packages/utils" })
    let io = workspacePackage({ name: "@yorozu/io", version: "0.1.0" }, { path: "/tmp/ws/packages/io" })
    let fetch = workspacePackage(
        { name: "@yorozu/fetch", version: "0.0.1", yorozu: { standalone: true } },
        { path: "/tmp/ws/packages/_standalone/fetch" },
    )
    let own = workspacePackage(
        { name: "@yorozu/legacy", version: "9.9.9", yorozu: { ownVersioning: true } },
        { path: "/tmp/ws/packages/legacy" },
    )
    return { root, utils, io, fetch, own, workspace: [root, utils, io, fetch, own] }
}

function commit(message: string, description = ""): CommitInfo {
    return {
        hash: "abc1234",
        author: { name: "a", email: "a@b.c", date: new Date(0) },
        committer: { name: "a", email: "a@b.c", date: new Date(0) },
        message,
        description,
    }
}

describe("bumpVersion", () => {
    it("bumps root 0.1.0 + minor to 0.2.0 on root, utils, and io; leaves standalone and ownVersioning alone", async () => {
        let { root, utils, io, fetch, own, workspace } = lockedWorkspace()

        let result = await bumpVersion({
            workspace,
            type: "minor",
            since: "HEAD",
            dryRun: true,
            withRoot: true,
        })

        expect(result.previousVersion).toBe("0.1.0")
        expect(result.nextVersion).toBe("0.2.0")
        expect(result.releaseType).toBe("minor")
        expect(result.hasBreakingChanges).toBe(false)
        expect(result.hasFeatures).toBe(false)
        expect(result.nextVersions).toEqual({
            yorozu: "0.2.0",
            "@yorozu/utils": "0.2.0",
            "@yorozu/io": "0.2.0",
        })
        expect(result.changedPackages.map(item => item.package.json.name).sort()).toEqual([
            "@yorozu/io",
            "@yorozu/utils",
            "yorozu",
        ])

        expect(root.json.version).toBe("0.2.0")
        expect(utils.json.version).toBe("0.2.0")
        expect(io.json.version).toBe("0.2.0")
        expect(fetch.json.version).toBe("0.0.1")
        expect(own.json.version).toBe("9.9.9")
    })

    it("still writes the shared version onto yorozu.private packages", async () => {
        let root = workspacePackage({ name: "yorozu", version: "0.1.0" }, { root: true })
        let secret = workspacePackage({ name: "@yorozu/secret", version: "0.1.0", yorozu: { private: true } })

        let result = await bumpVersion({
            workspace: [root, secret],
            type: "patch",
            since: "HEAD",
            dryRun: true,
        })

        expect(secret.json.version).toBe("0.1.1")
        expect(result.nextVersions["@yorozu/secret"]).toBe("0.1.1")
    })

    it("throws if the root package.json has no version", async () => {
        let root = workspacePackage({ name: "yorozu" }, { root: true })
        let utils = workspacePackage({ name: "@yorozu/utils", version: "0.1.0" })

        await expect(
            bumpVersion({
                workspace: [root, utils],
                type: "minor",
                since: "HEAD",
                dryRun: true,
            }),
        ).rejects.toThrow("Workspace root package.json is missing a version")
    })

    it("does not write package.json files when dryRun is true", async () => {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-bump-dry-"))
        let pkgPath = join(dir, "package.json")
        await writeFile(pkgPath, '{\n  "name": "@yorozu/utils",\n  "version": "0.1.0"\n}\n')

        let root = workspacePackage({ name: "yorozu", version: "0.1.0" }, { root: true, path: dir })
        let utils = workspacePackage(
            { name: "@yorozu/utils", version: "0.1.0" },
            { path: dir, packageJsonPath: pkgPath },
        )

        await bumpVersion({
            workspace: [root, utils],
            type: "minor",
            since: "HEAD",
            dryRun: true,
        })

        expect(await readFile(pkgPath, "utf8")).toBe('{\n  "name": "@yorozu/utils",\n  "version": "0.1.0"\n}\n')
        expect(utils.json.version).toBe("0.2.0")
    })

    it("writes the shared version and keeps the original indentation", async () => {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-bump-write-"))
        let rootPath = join(dir, "package.json")
        let utilsDir = join(dir, "packages", "utils")
        let utilsPath = join(utilsDir, "package.json")
        await mkdir(utilsDir, { recursive: true })
        await writeFile(rootPath, '{\n  "name": "yorozu",\n  "version": "0.1.0"\n}\n')
        await writeFile(utilsPath, '{\n  "name": "@yorozu/utils",\n  "version": "0.1.0"\n}\n')

        let root = workspacePackage(
            { name: "yorozu", version: "0.1.0" },
            { root: true, path: dir, packageJsonPath: rootPath },
        )
        let utils = workspacePackage(
            { name: "@yorozu/utils", version: "0.1.0" },
            { path: utilsDir, packageJsonPath: utilsPath },
        )

        await bumpVersion({
            workspace: [root, utils],
            type: "minor",
            since: "HEAD",
            dryRun: false,
            withRoot: true,
        })

        expect(await readFile(rootPath, "utf8")).toBe('{\n  "name": "yorozu",\n  "version": "0.2.0"\n}\n')
        expect(await readFile(utilsPath, "utf8")).toBe('{\n  "name": "@yorozu/utils",\n  "version": "0.2.0"\n}\n')
    })

    it("auto type uses every commit since `since` and still writes all managed packages", async () => {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-bump-auto-"))
        await git(dir, ["init", "-b", "main"])
        await git(dir, ["config", "user.email", "test@example.com"])
        await git(dir, ["config", "user.name", "Test"])
        await git(dir, ["config", "commit.gpgsign", "false"])

        let utilsDir = join(dir, "packages", "utils")
        let ioDir = join(dir, "packages", "io")
        await mkdir(utilsDir, { recursive: true })
        await mkdir(ioDir, { recursive: true })
        await writeFile(join(dir, "package.json"), '{"name":"yorozu","version":"0.1.0"}\n')
        await writeFile(join(utilsDir, "index.ts"), "export {}\n")
        await writeFile(join(ioDir, "index.ts"), "export {}\n")
        await git(dir, ["add", "."])
        await git(dir, ["commit", "-m", "chore: initial"])
        let since = await git(dir, ["rev-parse", "HEAD"])

        await writeFile(join(utilsDir, "index.ts"), "export const n = 1\n")
        await git(dir, ["add", "."])
        await git(dir, ["commit", "-m", "feat: only utils changed"])

        let root = workspacePackage(
            { name: "yorozu", version: "0.1.0" },
            { root: true, path: dir, packageJsonPath: join(dir, "package.json") },
        )
        let utils = workspacePackage({ name: "@yorozu/utils", version: "0.1.0" }, { path: utilsDir })
        let io = workspacePackage({ name: "@yorozu/io", version: "0.1.0" }, { path: ioDir })

        let result = await bumpVersion({
            workspace: [root, utils, io],
            since,
            cwd: dir,
            dryRun: true,
            withRoot: true,
        })

        expect(result.releaseType).toBe("patch")
        expect(result.hasFeatures).toBe(true)
        expect(result.hasBreakingChanges).toBe(false)
        expect(result.nextVersion).toBe("0.1.1")
        expect(utils.json.version).toBe("0.1.1")
        expect(io.json.version).toBe("0.1.1")
        expect(root.json.version).toBe("0.1.1")
    })
})

describe("determineBumpType", () => {
    it("maps a breaking change on 0.0.x to patch", () => {
        expect(determineBumpType({ oldVersion: "0.0.3", commits: [commit("feat!: explode")] })).toBe("patch")
    })

    it("maps a breaking change on 0.x.y (x > 0) to minor", () => {
        expect(determineBumpType({ oldVersion: "0.1.0", commits: [commit("feat!: explode")] })).toBe("minor")
    })

    it("maps feat on 0.x to patch", () => {
        expect(determineBumpType({ oldVersion: "0.1.0", commits: [commit("feat: add thing")] })).toBe("patch")
    })

    it("maps feat on 1.x to minor and breaking 1.x to major", () => {
        expect(determineBumpType({ oldVersion: "1.2.3", commits: [commit("feat: add thing")] })).toBe("minor")
        expect(determineBumpType({ oldVersion: "1.2.3", commits: [commit("feat!: explode")] })).toBe("major")
    })

    it("maps everything else to patch", () => {
        expect(determineBumpType({ oldVersion: "1.2.3", commits: [commit("fix: typo")] })).toBe("patch")
        expect(determineBumpType({ oldVersion: "0.1.0", commits: [] })).toBe("patch")
    })

    it("sees a BREAKING CHANGE footer in the commit body", () => {
        expect(
            determineBumpType({
                oldVersion: "0.1.0",
                commits: [commit("feat: change tags", "BREAKING CHANGE: tags are now vX.Y.Z")],
            }),
        ).toBe("minor")
    })

    it("throws on an invalid version", () => {
        expect(() => determineBumpType({ oldVersion: "nope", commits: [] })).toThrow("Invalid version: nope")
    })
})
