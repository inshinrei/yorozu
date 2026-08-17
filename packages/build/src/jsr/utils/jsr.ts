import type { ImportSpecifier } from "./external-libs"
import * as fsp from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { asyncPool } from "@yorozu/utils"
import semver from "semver"
import { z } from "zod"
import { directoryExists } from "../../misc/fs"
import { getModuleCacheDirectory } from "./external-libs"

const USER_AGENT = "@yorozu/build"
const REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_REGISTRY = process.env.JSR_URL ?? "https://jsr.io"

function joinRegistryUrl(registry: string, path: string): string {
    return `${registry.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
}

async function jsrFetch(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...init,
        headers: {
            "User-Agent": USER_AGENT,
            ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
}

export async function jsrCheckVersion(params: {
    registry?: string
    package: string
    version?: string
}): Promise<boolean> {
    let { registry = DEFAULT_REGISTRY, package: packageName, version } = params

    let res = await jsrFetch(joinRegistryUrl(registry, `/${packageName}/meta${version != null ? `_${version}` : ""}.json`))

    if (res.body) void res.body.cancel()
    return res.status === 200
}

let MetaSchema = z.object({
    versions: z.record(z.string(), z.unknown()),
})

let VersionMetaSchema = z.object({
    manifest: z.record(z.string(), z.unknown()),
})

export async function downloadJsrPackage(
    specifier: ImportSpecifier,
    params?: {
        registry?: string
        force?: boolean
    },
): Promise<string> {
    if (specifier.registry !== "jsr") {
        throw new Error("Invalid registry")
    }

    let registry = params?.registry ?? DEFAULT_REGISTRY

    let targetDir = `${specifier.packageName.replace(/\//g, "+")}@${specifier.version}`
    let registryHost = new URL(registry).host
    let cacheDir = join(getModuleCacheDirectory(), "jsr", registryHost, targetDir)

    if (await directoryExists(cacheDir)) {
        if (params?.force) {
            await fsp.rm(cacheDir, { recursive: true })
        } else {
            return cacheDir
        }
    }

    let metaRes = await jsrFetch(joinRegistryUrl(registry, `${specifier.packageName}/meta.json`))
    if (!metaRes.ok) {
        throw new Error(`Failed to fetch jsr meta for ${specifier.packageName}: ${metaRes.status}`)
    }
    let meta = MetaSchema.parse(await metaRes.json())
    let availableVersions = Object.keys(meta.versions)

    let version = semver.maxSatisfying(availableVersions, specifier.version)
    if (version == null) {
        throw new Error(`No matching version for ${specifier.packageName}@${specifier.version}`)
    }

    await fsp.mkdir(cacheDir, { recursive: true })
    let versionMetaRes = await jsrFetch(joinRegistryUrl(registry, `${specifier.packageName}/${version}_meta.json`))
    if (!versionMetaRes.ok) {
        throw new Error(`Failed to fetch jsr version meta for ${specifier.packageName}@${version}: ${versionMetaRes.status}`)
    }
    let versionMeta = VersionMetaSchema.parse(await versionMetaRes.json())

    await asyncPool(Object.keys(versionMeta.manifest), async file => {
        let relative = file.replace(/^\//, "")
        let filePath = join(cacheDir, relative)
        await fsp.mkdir(join(filePath, ".."), { recursive: true })

        let res = await jsrFetch(joinRegistryUrl(registry, `${specifier.packageName}/${version}/${relative}`))
        if (!res.ok) {
            throw new Error(`Failed to download ${specifier.packageName}@${version}/${relative}: ${res.status}`)
        }

        await fsp.writeFile(filePath, Buffer.from(await res.arrayBuffer()))
    })

    return cacheDir
}
