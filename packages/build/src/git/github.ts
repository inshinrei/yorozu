import { asyncPool } from "@yorozu/utils"
import { z } from "zod"

const USER_AGENT = "@yorozu/build"
const GITHUB_API_VERSION = "2022-11-28"
const DEFAULT_API_URL = "https://api.github.com"
const REQUEST_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 60_000

const ReleaseResponseSchema = z.object({
    id: z.number(),
    upload_url: z.string(),
})

function githubHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
    return {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `Bearer ${token}`,
        ...extra,
    }
}

async function readErrorBody(res: Response): Promise<string> {
    try {
        return await res.text()
    } catch {
        return ""
    }
}

export async function createGithubRelease(params: {
    token: string
    repo: string
    tag: string
    name: string
    body: string
    draft?: boolean
    prerelease?: boolean
    artifacts?: Array<{
        name: string
        type: string
        body: Uint8Array
    }>
    apiUrl?: string
}): Promise<number> {
    let apiUrl = (params.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "")

    let res = await fetch(`${apiUrl}/repos/${params.repo}/releases`, {
        method: "POST",
        headers: githubHeaders(params.token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
            tag_name: params.tag,
            name: params.name,
            body: params.body,
            draft: params.draft ?? false,
            prerelease: params.prerelease ?? false,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (res.status !== 201) {
        throw new Error(`GitHub release request failed with ${res.status}: ${await readErrorBody(res)}`)
    }

    let release = ReleaseResponseSchema.parse(await res.json())
    let uploadUrl = release.upload_url.split("{")[0]

    if (params.artifacts != null && params.artifacts.length > 0) {
        await asyncPool(
            params.artifacts,
            async file => {
                let url = new URL(uploadUrl)
                url.searchParams.set("name", file.name)

                let upload = await fetch(url, {
                    method: "POST",
                    headers: githubHeaders(params.token, {
                        "Content-Type": file.type,
                        "Content-Length": String(file.body.byteLength),
                    }),
                    body: file.body,
                    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
                })

                if (upload.status !== 201) {
                    throw new Error(
                        `failed to upload artifact: ${file.name}: GitHub artifact upload failed with ${upload.status}: ${await readErrorBody(upload)}`,
                    )
                }
            },
        )
    }

    return release.id
}
