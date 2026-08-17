import { randomUUID } from "node:crypto"
import { appendFileSync } from "node:fs"
import { EOL } from "node:os"
import process from "node:process"

export function isRunningInGithubActions(): boolean {
    return Boolean(process.env.GITHUB_ACTIONS)
}

export function getGithubActionsInput(name: string): string | undefined {
    let input = process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`]
    if (input === undefined) return undefined
    return input.trim()
}

export function writeGithubActionsOutput(name: string, value: string): void {
    if (process.env.GITHUB_OUTPUT === undefined) {
        throw new Error("GITHUB_OUTPUT is not set")
    }

    if (!value.includes(EOL)) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}${EOL}`, "utf8")
        return
    }

    let delim = `---${randomUUID()}---`
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delim}${EOL}${value}${EOL}${delim}${EOL}`, "utf8")
}
