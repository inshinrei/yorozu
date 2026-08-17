import { asNonNull } from "@yorozu/utils"
import type { PackageJson } from "../package-json/types"

export interface DenoJson {
    name: string
    version: string
    exports?: Record<string, string>
    imports?: Record<string, string>
    exclude?: Array<string>
    publish?: {
        exclude?: Array<string>
    }
}

export function packageJsonToDeno({
    packageJson,
    packageJsonOrig,
    workspaceVersions,
    exclude,
    buildDirName,
    baseDir,
}: {
    packageJson: PackageJson
    packageJsonOrig: PackageJson
    workspaceVersions: Map<string, string>
    buildDirName: string
    baseDir?: string
    exclude?: Array<string>
}): DenoJson {
    let importMap: Record<string, string> = {}
    let exports: Record<string, string> = {}

    for (let field of ["dependencies", "peerDependencies", "optionalDependencies"] as const) {
        let deps = packageJson[field]
        if (deps == null) continue

        for (let [name, version] of Object.entries(deps)) {
            if (typeof version !== "string") continue

            if (workspaceVersions.has(name)) {
                continue
            } else if (version.startsWith("npm:@jsr/")) {
                let rest = version.slice("npm:@jsr/".length)
                let jsrName = rest.split("@")[0].replace("__", "/")
                let jsrVersion = rest.split("@")[1]
                importMap[name] = `jsr:@${jsrName}@${jsrVersion}`
            } else if (version.startsWith("jsr:")) {
                importMap[name] = version
            } else if (name) {
                let packageName = name
                let packageVersion = version

                if (version.startsWith("npm:")) {
                    let npmValue = version.slice(4)
                    let idx = npmValue.lastIndexOf("@")
                    if (idx <= 0) {
                        throw new Error(`Invalid npm dependency: ${name}@${version}`)
                    }

                    packageName = npmValue.slice(0, idx)
                    packageVersion = npmValue.slice(idx + 1)
                } else if (version.match(/\|\||&&|:/)) {
                    throw new Error(`Invalid npm dependency (not supported by JSR): ${name}@${version}`)
                }

                importMap[name] = `npm:${packageName}@${packageVersion}`
            }
        }
    }

    if (packageJsonOrig.exports != null) {
        let tmpExports: Record<string, unknown>
        if (typeof packageJsonOrig.exports === "string") {
            tmpExports = { ".": packageJsonOrig.exports }
        } else if (typeof packageJsonOrig.exports !== "object") {
            throw new TypeError("package.json exports must be an object")
        } else {
            tmpExports = packageJsonOrig.exports as Record<string, unknown>
        }

        for (let [name, value] of Object.entries(tmpExports)) {
            if (typeof value !== "string") {
                throw new TypeError(`package.json exports value must be a string: ${name}`)
            }
            if (value.endsWith(".wasm")) continue

            if (baseDir != null && baseDir !== ".") {
                if (!value.startsWith(`./${baseDir}`)) {
                    throw new Error(`Invalid export value: ${value} (must be inside ./${baseDir})`)
                }
                exports[name] = `./${value.slice(baseDir.length + 3)}`
            } else {
                exports[name] = value
            }
        }
    }

    return {
        name: asNonNull(packageJson.name),
        version: asNonNull(packageJson.version),
        exports,
        exclude,
        imports: importMap,
        publish: {
            exclude: [`!../${buildDirName}`],
        },
        ...(packageJson.denoJson != null && typeof packageJson.denoJson === "object"
            ? (packageJson.denoJson as Record<string, unknown>)
            : {}),
    }
}
