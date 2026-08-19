import process from "node:process"
import { join } from "node:path"
import type { SpawnOptions } from "node:child_process"
import { asNonNull } from "@yorozu/utils"
import type { WorkspacePackage } from "../../package-json/collect-package-jsons"
import { collectPackageJsons } from "../../package-json/collect-package-jsons"
import { exec, type ExecResult } from "../../misc/exec"
import { fileExists } from "../../misc/fs"
import { error, info } from "../log"
import { bc, resolveWorkspaceRoot } from "./_utils"

export interface TypecheckPackageResult {
    name: string
    path: string
    ok: boolean
    output: string
}

export interface TypecheckResult {
    ok: boolean
    results: Array<TypecheckPackageResult>
}

export type TypecheckExists = (file: string) => Promise<boolean>
export type TypecheckRun = (cmd: Array<string>, options?: SpawnOptions & { throwOnError?: boolean; quiet?: boolean }) => Promise<ExecResult>

export async function typecheckTargets(
    packages: Array<WorkspacePackage>,
    exists: TypecheckExists = fileExists,
): Promise<Array<WorkspacePackage>> {
    let targets: Array<WorkspacePackage> = []
    for (let item of packages) {
        if (item.root) continue
        if (!(await exists(join(item.path, "tsconfig.json")))) continue
        targets.push(item)
    }
    return targets
}

export async function typecheckWorkspace(params: {
    packages: Array<WorkspacePackage>
    exists?: TypecheckExists
    run?: TypecheckRun
}): Promise<TypecheckResult> {
    let run = params.run ?? exec
    let targets = await typecheckTargets(params.packages, params.exists)
    let results: Array<TypecheckPackageResult> = []

    for (let item of targets) {
        let spawned = await run(["npx", "tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], {
            cwd: item.path,
            throwOnError: false,
        })
        let output = `${spawned.stdout}${spawned.stderr}`
        results.push({
            name: asNonNull(item.json.name),
            path: item.path,
            ok: spawned.exitCode === 0,
            output,
        })
    }

    return { ok: results.every(item => item.ok), results }
}

export let typecheckCli = bc.command({
    name: "typecheck",
    desc: "run tsc --noEmit for every workspace package",
    options: {
        workspace: bc.string().desc("path to the workspace root (default: cwd)"),
        noErrorCode: bc.boolean("no-error-code").desc("whether to always exit with a zero code").default(false),
    },
    handler: async args => {
        let workspaceRoot = resolveWorkspaceRoot(args.workspace)
        let packages = await collectPackageJsons(workspaceRoot, true)
        let result = await typecheckWorkspace({ packages })

        for (let item of result.results) {
            if (item.ok) {
                info(`typecheck ok: ${item.name}`)
                continue
            }
            error(new Error(`typecheck failed: ${item.name}\n${item.output}`))
        }

        if (result.ok) {
            info("all packages typecheck")
            return
        }
        if (!args.noErrorCode) process.exit(1)
    },
})
