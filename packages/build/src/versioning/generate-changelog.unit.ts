import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { exec } from "../misc/exec"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { PackageJson } from "../package-json/types"
import { generateChangelog } from "./generate-changelog"

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

async function setupRepo(): Promise<{
    dir: string
    since: string
    workspace: Array<WorkspacePackage>
}> {
    let dir = await mkdtemp(join(tmpdir(), "yorozu-changelog-"))
    await git(dir, ["init", "-b", "main"])
    await git(dir, ["config", "user.email", "test@example.com"])
    await git(dir, ["config", "user.name", "Test"])
    await git(dir, ["config", "commit.gpgsign", "false"])

    let utilsDir = join(dir, "packages", "utils")
    let ioDir = join(dir, "packages", "io")
    await mkdir(utilsDir, { recursive: true })
    await mkdir(ioDir, { recursive: true })
    await writeFile(join(utilsDir, "package.json"), '{"name":"@yorozu/utils","version":"0.1.0"}\n')
    await writeFile(join(ioDir, "package.json"), '{"name":"@yorozu/io","version":"0.1.0"}\n')
    await writeFile(join(utilsDir, "index.ts"), "export {}\n")
    await writeFile(join(ioDir, "index.ts"), "export {}\n")
    await git(dir, ["add", "."])
    await git(dir, ["commit", "-m", "chore: initial"])
    let since = await git(dir, ["rev-parse", "HEAD"])

    await writeFile(join(utilsDir, "index.ts"), "export const n = 1\n")
    await git(dir, ["add", "."])
    await git(dir, ["commit", "-m", "feat: add utils export"])

    await writeFile(join(ioDir, "index.ts"), "export const n = 2\n")
    await git(dir, ["add", "."])
    await git(dir, ["commit", "-m", "fix: tweak io export"])

    await writeFile(join(utilsDir, "index.ts"), "export const n = 3\n")
    await git(dir, ["add", "."])
    await git(dir, ["commit", "-m", "chore: format utils"])

    let workspace = [
        workspacePackage({ name: "yorozu", version: "0.1.0" }, dir, true),
        workspacePackage({ name: "@yorozu/utils", version: "0.1.0" }, utilsDir),
        workspacePackage({ name: "@yorozu/io", version: "0.1.0" }, ioDir),
    ]

    return { dir, since, workspace }
}

describe("generateChangelog", () => {
    it("groups conventional commits per package and skips chore by default", async () => {
        let { dir, since, workspace } = await setupRepo()

        let changelog = await generateChangelog({
            workspace,
            cwd: dir,
            since,
            params: {
                shouldInclude: () => true,
            },
        })

        expect(changelog).toContain("### @yorozu/utils")
        expect(changelog).toContain("feat: add utils export")
        expect(changelog).toContain("### @yorozu/io")
        expect(changelog).toContain("fix: tweak io export")
        expect(changelog).not.toContain("chore: format utils")
        expect(changelog).not.toContain("chore: initial")
    })

    it("applies commitFilter and commitFormatter hooks", async () => {
        let { dir, since, workspace } = await setupRepo()

        let changelog = await generateChangelog({
            workspace,
            cwd: dir,
            since,
            params: {
                shouldInclude: () => true,
                changelog: {
                    commitFilter: (_commit, parsed) => parsed.type === "feat",
                    commitFormatter: (commit, parsed) => `* ${parsed.subject} (${commit.hash.slice(0, 7)})`,
                },
            },
        })

        expect(changelog).toContain("### @yorozu/utils")
        expect(changelog).toContain("* add utils export")
        expect(changelog).not.toContain("### @yorozu/io")
        expect(changelog).not.toContain("fix: tweak io export")
    })
})
