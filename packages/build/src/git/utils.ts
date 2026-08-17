import { randomUUID } from "node:crypto"
import { exec } from "../misc/exec"

const CONVENTIONAL_COMMIT_RE = /^(\w+)(?:\(([^)]+)\))?(!?): (.+)$/
const BREAKING_CHANGE_RE = /^BREAKING[- ]CHANGE:/

export async function getLatestTag(cwd?: string | URL): Promise<string | null> {
    let res = await exec(["git", "describe", "--abbrev=0", "--tags"], { cwd })

    if (res.exitCode !== 0) {
        if (res.stderr.match(/^fatal: (?:No names found|No tags can describe)/i)) {
            return null
        }
        throw new Error(`git describe failed: ${res.stderr}`)
    }

    return res.stdout.trim()
}

export async function getFirstCommit(cwd?: string | URL): Promise<string> {
    return (
        await exec(["git", "rev-list", "--max-parents=0", "HEAD"], {
            cwd,
            throwOnError: true,
        })
    ).stdout.trim()
}

export async function getCurrentCommit(cwd?: string | URL): Promise<string> {
    let res = await exec(["git", "rev-parse", "HEAD"], {
        cwd,
        throwOnError: true,
    })
    return res.stdout.trim()
}

export async function getCurrentBranch(cwd?: string | URL): Promise<string> {
    let res = await exec(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
        cwd,
        throwOnError: true,
    })
    return res.stdout.trim()
}

export async function gitTagExists(tag: string, cwd?: string | URL): Promise<boolean> {
    let res = await exec(["git", "tag", "--list", tag], {
        cwd,
        throwOnError: true,
    })
    return res.stdout.trim() !== ""
}

export async function findChangedFiles(params: {
    since: string
    until?: string
    cwd?: string | URL
}): Promise<Array<string>> {
    let { since, until = "HEAD", cwd } = params
    let res = await exec(["git", "diff", "--name-only", since, until], {
        cwd,
        throwOnError: true,
    })

    let files = res.stdout.trim().split("\n")
    if (files.length === 1 && files[0] === "") {
        return []
    }
    return files
}

export interface CommitInfo {
    hash: string
    author: {
        name: string
        email: string
        date: Date
    }
    committer: {
        name: string
        email: string
        date: Date
    }
    message: string
    description: string
}

export async function getCommitsBetween(params: {
    since?: string
    files?: Array<string>
    until?: string
    cwd?: string | URL
}): Promise<Array<CommitInfo>> {
    let { since, until = "HEAD", cwd, files } = params
    let delim = `---${randomUUID()}---`

    let res = await exec(
        [
            "git",
            "log",
            `--pretty=format:%H %s%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%b%n${delim}`,
            since != null ? `${since}..${until}` : until,
            ...(files?.length ? ["--", ...files] : []),
        ],
        {
            cwd,
            throwOnError: true,
        },
    )

    let lines = res.stdout.trim().split("\n")
    if (lines.length === 1 && lines[0] === "") return []

    let items: Array<CommitInfo> = []
    let current: CommitInfo | null = null

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]

        if (line === delim) {
            if (current) items.push(current)
            current = null
        } else if (current) {
            if (current.description) current.description += "\n"
            current.description += line
        } else {
            let [hash, ...msg] = line.split(" ")
            let authorName = lines[++i]
            let authorEmail = lines[++i]
            let authorDate = lines[++i]
            let committerName = lines[++i]
            let committerEmail = lines[++i]
            let committerDate = lines[++i]

            current = {
                hash,
                author: {
                    name: authorName,
                    email: authorEmail,
                    date: new Date(authorDate),
                },
                committer: {
                    name: committerName,
                    email: committerEmail,
                    date: new Date(committerDate),
                },
                message: msg.join(" "),
                description: "",
            }
        }
    }

    if (current) items.push(current)

    return items.reverse()
}

export interface ConventionalCommit {
    type: string
    scope?: string
    breaking: boolean
    subject: string
}

export function parseConventionalCommit(msg: string): ConventionalCommit | null {
    let [header, ...rest] = msg.split("\n")
    let match = header.match(CONVENTIONAL_COMMIT_RE)
    if (!match) return null

    let [, type, scope, bang, subject] = match
    let footerBreaking = rest.some(line => BREAKING_CHANGE_RE.test(line.trim()))

    return {
        type,
        ...(scope ? { scope } : {}),
        breaking: Boolean(bang) || footerBreaking,
        subject,
    }
}
