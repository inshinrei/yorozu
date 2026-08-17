import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { exec } from "../misc/exec"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { PackageJson } from "../package-json/types"
import { findProjectChangedFiles, findProjectChangedPackages } from "./collect-files"

function workspacePackage(json: PackageJson, path: string, root = false): WorkspacePackage {
    return {
        path,
        packageJsonPath: join(path, "package.json"),
        root,
        json,
    }
}

async function git(cwd: string, args: Array<string>): Promise<string> {
    let res = await exec(["git", ...args], { cwd, throwOnError: true })
    return res.stdout.trim()
}

describe("findProjectChangedPackages", () => {
    it("returns packages with source changes and excludes unit tests and markdown by default", async () => {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-changed-"))
        await git(dir, ["init", "-b", "main"])
        await git(dir, ["config", "user.email", "test@example.com"])
        await git(dir, ["config", "user.name", "Test"])
        await git(dir, ["config", "commit.gpgsign", "false"])

        let utilsDir = join(dir, "packages", "utils")
        let ioDir = join(dir, "packages", "io")
        await mkdir(utilsDir, { recursive: true })
        await mkdir(ioDir, { recursive: true })
        await writeFile(join(utilsDir, "index.ts"), "export {}\n")
        await writeFile(join(ioDir, "index.ts"), "export {}\n")
        await git(dir, ["add", "."])
        await git(dir, ["commit", "-m", "chore: initial"])
        let since = await git(dir, ["rev-parse", "HEAD"])

        await writeFile(join(utilsDir, "index.ts"), "export const n = 1\n")
        await writeFile(join(utilsDir, "index.unit.ts"), "export {}\n")
        await writeFile(join(utilsDir, "notes.md"), "# notes\n")
        await writeFile(join(ioDir, "readme.md"), "# io\n")
        await git(dir, ["add", "."])
        await git(dir, ["commit", "-m", "feat: change files"])

        let workspace = [
            workspacePackage({ name: "yorozu", version: "0.1.0" }, dir, true),
            workspacePackage({ name: "@yorozu/utils", version: "0.1.0" }, utilsDir),
            workspacePackage({ name: "@yorozu/io", version: "0.1.0" }, ioDir),
        ]

        let files = await findProjectChangedFiles({
            workspace,
            root: dir,
            since,
            params: { shouldInclude: () => true },
        })
        expect(files.map(file => `${file.package.json.name}:${file.file}`)).toEqual(["@yorozu/utils:index.ts"])

        let packages = await findProjectChangedPackages({
            workspace,
            root: dir,
            since,
            params: { shouldInclude: () => true },
        })
        expect(packages.map(pkg => pkg.json.name)).toEqual(["@yorozu/utils"])
    })

    it("includes .ts files when there is no tsconfig instead of throwing", async () => {
        let dir = await mkdtemp(join(tmpdir(), "yorozu-changed-nots-"))
        await git(dir, ["init", "-b", "main"])
        await git(dir, ["config", "user.email", "test@example.com"])
        await git(dir, ["config", "user.name", "Test"])
        await git(dir, ["config", "commit.gpgsign", "false"])

        let utilsDir = join(dir, "packages", "utils")
        await mkdir(utilsDir, { recursive: true })
        await writeFile(join(utilsDir, "index.ts"), "export {}\n")
        await git(dir, ["add", "."])
        await git(dir, ["commit", "-m", "chore: initial"])
        let since = await git(dir, ["rev-parse", "HEAD"])

        await writeFile(join(utilsDir, "index.ts"), "export const n = 1\n")
        await git(dir, ["add", "."])
        await git(dir, ["commit", "-m", "feat: change files"])

        let workspace = [
            workspacePackage({ name: "yorozu", version: "0.1.0" }, dir, true),
            workspacePackage({ name: "@yorozu/utils", version: "0.1.0" }, utilsDir),
        ]

        let files = await findProjectChangedFiles({
            workspace,
            root: dir,
            since,
        })
        expect(files.map(file => `${file.package.json.name}:${file.file}`)).toEqual(["@yorozu/utils:index.ts"])
    })
})
