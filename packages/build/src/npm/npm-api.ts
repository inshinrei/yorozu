const USER_AGENT = "@yorozu/build"
const DEFAULT_REGISTRY = "https://registry.npmjs.org"
const REQUEST_TIMEOUT_MS = 30_000

export const NPM_PACKAGE_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export async function npmCheckVersion(params: {
    registry?: string
    package: string
    version: string
}): Promise<boolean> {
    let registry = (params.registry ?? DEFAULT_REGISTRY).replace(/\/$/, "")
    let url = `${registry}/${params.package}/${params.version}`

    let res = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (res.body) {
        void res.body.cancel()
    }

    return res.status === 200
}
