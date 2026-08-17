import * as fsp from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import { asyncPool } from "@yorozu/utils"
import ts from "typescript"
import { info } from "../cli/log"
import { exec } from "../misc/exec"
import { determinePublishOrder } from "../misc/publish-order"
import { parseImportSpecifier } from "./utils/external-libs"
import { jsrMaybeCreatePackage } from "./utils/jsr-api"
import { findClosestJsrJson, parseJsrJson } from "./utils/jsr-json"
import { downloadJsrPackage } from "./utils/jsr"

async function findPackageDependencies(packagePath: string): Promise<Array<string>> {
    let jsrJsonPath = findClosestJsrJson(packagePath)
    if (jsrJsonPath == null) {
        throw new Error(`Could not find jsr.json for package at ${packagePath}`)
    }
    let jsrJson = parseJsrJson(await fsp.readFile(jsrJsonPath, "utf8"))
    let entrypoints = typeof jsrJson.exports === "string" ? [jsrJson.exports] : Object.values(jsrJson.exports)

    let visited = new Set<string>()
    let dependencies = new Set<string>()
    let queue = [...entrypoints]

    while (queue.length > 0) {
        let file = queue.shift()
        if (file == null || visited.has(file)) {
            continue
        }
        visited.add(file)

        const handleSpecifier = (specifier: string) => {
            if (specifier.startsWith("jsr:")) {
                let parsed = parseImportSpecifier(specifier)
                dependencies.add(`${parsed.packageName}@${parsed.version}`)
            } else if (specifier.startsWith(".")) {
                let resolved = resolve(dirname(join(packagePath, file)), specifier)

                let relative = resolved.slice(packagePath.length + 1)
                if (!relative.startsWith(".")) relative = `./${relative}`
                queue.push(relative)
            }
        }

        let content = await fsp.readFile(join(packagePath, file), "utf8")
        let source = ts.createSourceFile(file, content, ts.ScriptTarget.ESNext, true)

        for (let node of source.statements) {
            if (ts.isImportDeclaration(node)) {
                handleSpecifier(node.moduleSpecifier.getText().slice(1, -1))
            } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
                handleSpecifier(node.moduleSpecifier.getText().slice(1, -1))
            }
        }
    }

    return Array.from(dependencies)
}

export async function populateFromUpstream(params: {
    upstream?: string
    downstream: string
    packages: Array<string>
    token?: string
    createViaApi?: boolean
    deno?: string
    quiet?: boolean
    publishArgs?: Array<string> | ((pkg: string) => Array<string>)
}): Promise<void> {
    let {
        upstream = "https://jsr.io",
        downstream,
        packages,
        token,
        createViaApi = false,
        deno = "deno",
        quiet = false,
        publishArgs: _publishArgs,
    } = params

    let publishArgs = typeof _publishArgs === "function" ? _publishArgs : () => _publishArgs || []

    if (createViaApi && token == null) {
        throw new Error("createViaApi requires a token")
    }

    let depsMap = new Map<string, Array<string>>()
    let nameToPath = new Map<string, string>()
    let pending = [...packages]
    let seen = new Set<string>()

    while (pending.length > 0) {
        let batch = pending.splice(0, pending.length).filter(pkg => !seen.has(pkg))
        for (let pkg of batch) seen.add(pkg)
        if (batch.length === 0) break

        await asyncPool(batch, async pkg => {
            if (!quiet) {
                info(`Downloading ${pkg}...`)
            }

            let specifier = parseImportSpecifier(`jsr:${pkg}`)
            let path = await downloadJsrPackage(specifier, { registry: upstream })
            nameToPath.set(pkg, path)

            let deps = await findPackageDependencies(path)
            depsMap.set(pkg, deps)
            for (let dep of deps) {
                if (!seen.has(dep)) pending.push(dep)
            }
        })
    }

    let order = determinePublishOrder(Object.fromEntries(depsMap))

    for (let item of order) {
        let spec = parseImportSpecifier(`jsr:${item}`)
        let path = nameToPath.get(item)
        if (path == null) {
            throw new Error(`Missing downloaded package path for ${item}`)
        }

        if (createViaApi) {
            await jsrMaybeCreatePackage({
                name: spec.packageName,
                registry: downstream,
                token: token as string,
                quiet,
            })
        }

        if (!quiet) {
            info(`Publishing ${item}...`)
        }

        await exec([deno, "publish", "--quiet", ...(token != null ? ["--token", token] : []), ...publishArgs(item)], {
            env: {
                ...process.env,
                JSR_URL: downstream,
            },
            cwd: path,
            stdio: "inherit",
            throwOnError: true,
        })
    }
}
