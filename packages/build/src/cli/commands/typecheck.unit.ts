import { describe, expect, it } from "vitest"
import type { WorkspacePackage } from "../../package-json/collect-package-jsons"
import type { PackageJson } from "../../package-json/types"
import { typecheckTargets, typecheckWorkspace } from "./typecheck"

function pkg(name: string, extras: Partial<WorkspacePackage> = {}): WorkspacePackage {
    return {
        path: extras.path ?? `/tmp/${name}`,
        packageJsonPath: extras.packageJsonPath ?? `/tmp/${name}/package.json`,
        root: extras.root ?? false,
        json: { name } as PackageJson,
    }
}

describe("typecheckTargets", () => {
    it("skips the root package and packages without tsconfig.json", async () => {
        let hasTsconfig = new Set(["/tmp/utils"])
        let targets = await typecheckTargets(
            [pkg("yorozu", { path: "/tmp/root", root: true }), pkg("@yorozu/utils", { path: "/tmp/utils" }), pkg("@yorozu/empty", { path: "/tmp/empty" })],
            async file => hasTsconfig.has(file.replace(/\/tsconfig\.json$/, "")),
        )
        expect(targets.map(item => item.json.name)).toEqual(["@yorozu/utils"])
    })
})

describe("typecheckWorkspace", () => {
    it("runs tsc --noEmit -p tsconfig.json in each target and reports failures", async () => {
        let calls: Array<{ cmd: Array<string>; cwd: unknown }> = []
        let result = await typecheckWorkspace({
            packages: [pkg("@yorozu/utils", { path: "/tmp/utils" }), pkg("@yorozu/io", { path: "/tmp/io" })],
            exists: async file => file.endsWith("tsconfig.json"),
            run: async (cmd, options) => {
                calls.push({ cmd, cwd: options?.cwd })
                let ok = options?.cwd === "/tmp/utils"
                return { stdout: ok ? "" : "error TS0000: boom\n", stderr: "", exitCode: ok ? 0 : 2 }
            },
        })
        expect(calls).toEqual([
            { cmd: ["npx", "tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], cwd: "/tmp/utils" },
            { cmd: ["npx", "tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], cwd: "/tmp/io" },
        ])
        expect(result.ok).toBe(false)
        expect(result.results).toEqual([
            { name: "@yorozu/utils", path: "/tmp/utils", ok: true, output: "" },
            { name: "@yorozu/io", path: "/tmp/io", ok: false, output: "error TS0000: boom\n" },
        ])
    })
})
