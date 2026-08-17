import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { afterEach, describe, expect, it } from "vitest"
import type { Plugin } from "vite"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { PackageJson } from "../package-json/types"
import { processPackageJson } from "../package-json/process-package-json"
import { yorozuBuild } from "./build-plugin"

function asPlugin(value: unknown): Plugin {
    if (value == null || typeof value !== "object" || !("name" in value)) {
        throw new Error("expected a vite plugin")
    }
    return value as Plugin
}

async function runCloseBundle(plugin: Plugin): Promise<void> {
    let configHook = plugin.config
    let handler = typeof configHook === "function" ? configHook : configHook?.handler
    if (handler == null) throw new Error("plugin is missing config hook")
    await handler.call({} as never, {}, { command: "build", mode: "production", isSsrBuild: false })

    let closeHook = plugin.closeBundle
    let close = typeof closeHook === "function" ? closeHook : closeHook?.handler
    if (close == null) throw new Error("plugin is missing closeBundle hook")
    await close.call({} as never)
}

describe("yorozuBuild package.json processing", () => {
    let dirs: Array<string> = []
    let previousPackagesList = process.env.__YOROZU_INTERNAL_PACKAGES_LIST
    let previousFixedVersion = process.env.__YOROZU_INTERNAL_FIXED_VERSION

    afterEach(async () => {
        if (previousPackagesList === undefined) delete process.env.__YOROZU_INTERNAL_PACKAGES_LIST
        else process.env.__YOROZU_INTERNAL_PACKAGES_LIST = previousPackagesList
        if (previousFixedVersion === undefined) delete process.env.__YOROZU_INTERNAL_FIXED_VERSION
        else process.env.__YOROZU_INTERNAL_FIXED_VERSION = previousFixedVersion

        await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })))
        dirs = []
    })

    async function tempWorkspace(pkgJson: PackageJson): Promise<{ workspaceRoot: string; packageRoot: string }> {
        let workspaceRoot = await mkdtemp(join(tmpdir(), "yorozu-build-plugin-"))
        dirs.push(workspaceRoot)
        let packageRoot = join(workspaceRoot, "packages", "pkg")
        await mkdir(packageRoot, { recursive: true })
        await writeFile(join(workspaceRoot, "package.json"), JSON.stringify({ name: "root", workspaces: ["packages/*"] }))
        await writeFile(join(packageRoot, "package.json"), JSON.stringify(pkgJson))

        let workspace: Array<WorkspacePackage> = [
            {
                path: workspaceRoot,
                packageJsonPath: join(workspaceRoot, "package.json"),
                root: true,
                json: { name: "root", workspaces: ["packages/*"] },
            },
            {
                path: packageRoot,
                packageJsonPath: join(packageRoot, "package.json"),
                root: false,
                json: pkgJson,
            },
        ]
        process.env.__YOROZU_INTERNAL_PACKAGES_LIST = JSON.stringify(workspace)
        return { workspaceRoot, packageRoot }
    }

    it("sets packageJson.version from fixedVersion after processPackageJson", async () => {
        let { workspaceRoot, packageRoot } = await tempWorkspace({
            name: "@tmp/pkg",
            version: "1.2.3",
            exports: { ".": "./src/index.ts" },
        })
        process.env.__YOROZU_INTERNAL_FIXED_VERSION = "0.0.0-canary.1"

        let plugins = await yorozuBuild({ root: workspaceRoot, packageRoot })
        let plugin = asPlugin(plugins.find(item => asPlugin(item).name === "vite-plugin-yorozu-build"))
        await mkdir(join(packageRoot, "dist"), { recursive: true })
        await runCloseBundle(plugin)

        let dist = JSON.parse(await readFile(join(packageRoot, "dist", "package.json"), "utf8")) as PackageJson
        expect(dist.version).toBe("0.0.0-canary.1")
    })

    it("calls processPackageJson with hookContext.packageJson after preparePackageJson replacement", async () => {
        let { workspaceRoot, packageRoot } = await tempWorkspace({
            name: "@tmp/pkg",
            version: "1.0.0",
            exports: { ".": "./src/original.ts" },
        })

        let plugins = await yorozuBuild({
            root: workspaceRoot,
            packageRoot,
            preparePackageJson(ctx) {
                ctx.packageJson = {
                    ...ctx.packageJson,
                    exports: { "./replaced": "./src/replaced.ts" },
                }
            },
        })
        let plugin = asPlugin(plugins.find(item => asPlugin(item).name === "vite-plugin-yorozu-build"))
        await mkdir(join(packageRoot, "dist"), { recursive: true })
        await runCloseBundle(plugin)

        let dist = JSON.parse(await readFile(join(packageRoot, "dist", "package.json"), "utf8")) as PackageJson
        expect(Object.keys(dist.exports ?? {})).toEqual(["./replaced"])
        expect(dist.exports).toEqual({
            "./replaced": {
                import: { types: "./replaced.d.ts", default: "./replaced.js" },
            },
        })
    })
})

describe("@yorozu/build preparePackageJson", () => {
    it("flattens ./vite so processPackageJson accepts the package", async () => {
        let source = (await import("../package-json/parse")).parsePackageJson(
            await readFile(join(import.meta.dirname, "../../package.json"), "utf8"),
        )
        let config = (await import("../../build.config.js")).default as {
            preparePackageJson: (ctx: { packageJson: PackageJson }) => void
        }

        expect(() => processPackageJson({ packageJson: structuredClone(source), onlyEntrypoints: true })).toThrow(
            "package.json export value must be a string",
        )

        let hookContext = { packageJson: structuredClone(source) }
        config.preparePackageJson(hookContext)
        expect(hookContext.packageJson.exports["./vite"]).toBe("./src/vite/index.ts")
        expect(hookContext.packageJson.exports["./vite-internal"]).toBeUndefined()

        let result = processPackageJson({ packageJson: hookContext.packageJson, onlyEntrypoints: true })
        expect(result.entrypoints.get("vite")).toBe("./src/vite/index.ts")
    })
})
