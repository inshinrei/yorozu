import type { SpawnOptions } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { spawn } from "cross-spawn"
import { info } from "../cli/log"
import { normalizeFilePath } from "./path"

export interface ExecResult {
    stdout: string
    stderr: string
    exitCode: number
}

export class ExecError extends Error {
    constructor(
        readonly cmd: Array<string>,
        readonly result: ExecResult,
    ) {
        super(`Command exited with code ${result.exitCode}`, {
            cause: result,
        })
    }
}

export function exec(
    cmd: Array<string>,
    options?: SpawnOptions & {
        throwOnError?: boolean
        quiet?: boolean
    },
): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        if (options?.stdio === "inherit" && !options.quiet) {
            let cmdStr = cmd.map(part => (part.includes(" ") ? `"${part.replace(/"/g, '\\"')}"` : part)).join(" ")

            let cwdStr = ""
            if (options?.cwd != null) {
                let normCwd = path.resolve(normalizeFilePath(options.cwd))
                if (normCwd !== process.cwd()) {
                    cwdStr = `\x1B[;3m${path.relative(process.cwd(), normCwd)}\x1B[;23m `
                }
            }

            info(`${cwdStr}\x1B[;34m$\x1B[;0m ${cmdStr}`)
        }

        let proc = spawn(cmd[0], cmd.slice(1), {
            stdio: "pipe",
            ...options,
        })

        let stdout: Array<Uint8Array> = []
        let stderr: Array<Uint8Array> = []

        proc.stdout?.on("data", data => {
            stdout.push(data as Uint8Array)
        })

        proc.stderr?.on("data", data => {
            stderr.push(data as Uint8Array)
        })

        proc.on("error", reject)

        proc.on("close", code => {
            let result: ExecResult = {
                stdout: Buffer.concat(stdout).toString(),
                stderr: Buffer.concat(stderr).toString(),
                exitCode: code ?? -1,
            }

            if (result.exitCode !== 0 && options?.throwOnError) {
                reject(new ExecError(cmd, result))
                return
            }

            resolve(result)
        })
    })
}
