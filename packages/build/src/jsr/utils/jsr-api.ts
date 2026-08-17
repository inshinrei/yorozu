import { info } from "../../cli/log"

const USER_AGENT = "@yorozu/build"
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RETRIES = 3

function joinRegistryUrl(registry: string, path: string): string {
    return `${registry.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
}

async function readErrorBody(res: Response): Promise<string> {
    try {
        return await res.text()
    } catch {
        return ""
    }
}

async function jsrFetch(url: string, init: RequestInit = {}): Promise<Response> {
    let lastError: unknown

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await fetch(url, {
                ...init,
                headers: {
                    "User-Agent": USER_AGENT,
                    ...init.headers,
                },
                signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        } catch (err) {
            lastError = err
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function jsonInit(token: string, body: unknown): RequestInit {
    return {
        headers: {
            Cookie: `token=${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    }
}

export async function jsrGetScopeInfo(params: { scope: string; registry: string }): Promise<unknown> {
    let { scope, registry } = params
    let res = await jsrFetch(joinRegistryUrl(registry, `/api/scopes/${scope}`))

    if (res.status === 404) {
        if (res.body) void res.body.cancel()
        return null
    }
    if (res.status !== 200) {
        throw new Error(`Failed to get scope info: ${res.status} ${await readErrorBody(res)}`)
    }

    return res.json()
}

export async function jsrCreateScope(params: {
    name: string
    registry: string
    token: string
    quiet?: boolean
}): Promise<void> {
    let { name, registry, token, quiet } = params

    let create = await jsrFetch(joinRegistryUrl(registry, "/api/scopes"), {
        method: "POST",
        ...jsonInit(token, { scope: name }),
    })

    if (create.status !== 200) {
        throw new Error(`Failed to create scope: ${create.status} ${await create.text()}`)
    }

    if (create.body) void create.body.cancel()

    if (!quiet) {
        info(`Created scope @${name}`)
    }
}

export async function jsrMaybeCreatePackage(params: {
    name: string
    registry: string
    token: string
    quiet?: boolean
}): Promise<void> {
    let { name, registry, token, quiet } = params

    let [scopeWithAt, packageName] = name.split("/")
    if (!packageName || !scopeWithAt || !scopeWithAt.startsWith("@")) {
        throw new Error("Invalid package name")
    }
    let scope = scopeWithAt.slice(1)

    let packageMeta = await jsrFetch(joinRegistryUrl(registry, `/api/scopes/${scope}/packages/${packageName}`))
    if (packageMeta.status === 200) {
        if (packageMeta.body) void packageMeta.body.cancel()
        return
    }
    if (packageMeta.status !== 404) {
        throw new Error(`Failed to check package: ${packageMeta.status} ${await packageMeta.text()}`)
    }
    if (packageMeta.body) void packageMeta.body.cancel()

    if (!quiet) {
        info(`${name} does not exist, creating..`)
    }

    let create = await jsrFetch(joinRegistryUrl(registry, `/api/scopes/${scope}/packages`), {
        method: "POST",
        ...jsonInit(token, { package: packageName }),
    })

    if (create.status !== 200) {
        let text = await create.text()

        if (create.status === 403) {
            try {
                let json = JSON.parse(text) as Record<string, unknown>
                if (json.code === "actorNotScopeMember") {
                    let scopeInfo = await jsrGetScopeInfo({ scope, registry })

                    if (scopeInfo === null) {
                        await jsrCreateScope({ name: scope, registry, token, quiet })
                        return jsrMaybeCreatePackage({
                            ...params,
                            quiet: true,
                        })
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.message.startsWith("Failed to")) throw err
            }
        }

        throw new Error(`Failed to create package: ${create.status} ${text}`)
    }

    if (create.body) void create.body.cancel()
}

export async function jsrSetGithubRepo(params: {
    registry: string
    name: string
    token: string
    owner: string
    repo: string
}): Promise<void> {
    let { registry, name, token, owner, repo } = params

    let [scopeWithAt, packageName] = name.split("/")
    if (!packageName || !scopeWithAt || !scopeWithAt.startsWith("@")) {
        throw new Error("Invalid package name")
    }
    let scope = scopeWithAt.slice(1)

    let res = await jsrFetch(joinRegistryUrl(registry, `/api/scopes/${scope}/packages/${packageName}`), {
        method: "PATCH",
        ...jsonInit(token, {
            githubRepository: { owner, name: repo },
        }),
    })

    if (res.status !== 200) {
        throw new Error(`Failed to set github repo: ${await res.text()}`)
    }

    if (res.body) void res.body.cancel()
}
