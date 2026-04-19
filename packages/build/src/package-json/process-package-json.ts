import type {PackageJson} from "./types";

const DefaultFieldsToCopyRoot = new Set(['license', 'author', 'contributors', 'homepage', 'repository', 'bugs'])

let RegExpMatcher = new RegExp(/(?<!\.d)\.[mc]?[jt]sx?$/i)
const DefaultShouldCopyEntrypoint = (name: string, target: string ) =>!target.match(RegExpMatcher)

interface ProcessPackageJsonParams {
    packageJson: PackageJson
    onlyEntrypoints?: boolean
    workspaceVersions?: Map<string, string>
    bundledWorkspaceDeps?: Array<RegExp>
    rootPackageJson?: PackageJson
    rootFieldsToCopy?: Set<string>
    shouldCopyEntrypoint?: (name: string, target: string) => boolean
    fixedVersion?: string
}

interface ProcessPackageJsonReturn {
    packageJson: PackageJson
    packageJsonOriginal: PackageJson
    entrypoints: Map<string, string>
    entrypointsToCopy: Map<string, string>
}

function copyRootFields(packageJson: PackageJson, rootPackageJson?: PackageJson, rootFieldsToCopy = DefaultFieldsToCopyRoot): PackageJson {
    if (!rootPackageJson) return packageJson
    let result = { ...packageJson }
    for (let field of rootFieldsToCopy) {
        if (rootPackageJson[field] != null && result[field] == null) {
            result[field] = rootPackageJson[field]
        }
    }
    return result
}

function filterKeepScripts(packageJson: PackageJson): PackageJson {
    let result = { ...packageJson }
    if (result.scripts && Array.isArray(result.yorozu?.keepScripts)) {
        let newScripts = new Map<string, string>()
        for (let script of result.yorozu.keepScripts) {
            if (typeof script !== "string") continue
            if (script in result.scripts) {
                newScripts.set(script, result.scripts[script])
            }
        }
        result.scripts = Object.fromEntries(newScripts)
    } else {
        delete result.scripts
    }
    return result
}

function applyDistOnlyFields(packageJson: PackageJson): PackageJson {
    let result = { ...packageJson }
    delete result.devDependencies
    delete result.private
    if (result.yorozu?.distOnlyFields) {
        Object.assign(result, result.yorozu.distOnlyFields)
    }
    return result
}

function replaceWorkspaceDependencies(
    packageJson: PackageJson,
    workspaceVersions?: Map<string, string>,
    bundledWorkspaceDeps?: Array<RegExp>,
    fixedVersion?: string
): PackageJson {
    let result = { ...packageJson }

    function replaceField(field: keyof PackageJson) {
        if (result[field] == null) return
        let deps = result[field] as Record<string, string>
        let newDeps = { ...deps }

        for (let name of Object.keys(deps)) {
            let value = deps[name]
            if (!value.startsWith("workspace:")) continue

            if (bundledWorkspaceDeps?.some(dep => dep.test(name))) {
                delete newDeps[name]
                continue
            }

            if (value !== "workspace:^" && value !== "workspace:*") {
                throw new Error(`Cannot replace workspace dependency ${name} with ${value}. Only workspace:^ and workspace:* are supported.`)
            }

            if (workspaceVersions?.get(name) == null) {
                throw new Error(`Cannot replace dependency: ${name} not found in workspace.`)
            }

            let workspaceVersion = workspaceVersions.get(name)!
            newDeps[name] = fixedVersion != null
                ? fixedVersion
                : value === "workspace:*" ? workspaceVersion : `^${workspaceVersion}`
        }

        result[field] = newDeps
    }

    replaceField("dependencies")
    replaceField("peerDependencies")
    replaceField("optionalDependencies")
    return result
}

function transformExports(
    packageJson: PackageJson,
    shouldCopyEntrypoint = DefaultShouldCopyEntrypoint
): { packageJson: PackageJson; entrypoints: Map<string, string>; entrypointsToCopy: Map<string, string> } {
    let result = { ...packageJson }
    let entrypoints = new Map<string, string>()
    let entrypointsToCopy = new Map<string, string>()

    if (result.exports == null) {
        return { packageJson: result, entrypoints, entrypointsToCopy }
    }

    let exports = result.exports
    if (typeof exports === "string") {
        exports = { ".": exports }
    }

    if (typeof exports !== "object" || exports === null) {
        throw new TypeError("package.json exports must be an object.")
    }

    let newExports = new Map<string, unknown>()

    for (let [key, value] of Object.entries(exports)) {
        if (typeof value !== "string") {
            throw new TypeError(`package.json export value must be a string: ${key}.`)
        }

        if (shouldCopyEntrypoint(key, value)) {
            newExports.set(key, key)
            entrypointsToCopy.set(key, value)
            continue
        }

        let entrypointName = key.replace(/^\.(?:\/|$)/, '').replace(/\.js$/, '')
        if (entrypointName === "") entrypointName = "index"

        entrypoints.set(entrypointName, value)

        newExports.set(key, {
            import: {
                types: `./${entrypointName}.d.ts`,
                default: `./${entrypointName}.js`,
            },
            require: {
                types: `./${entrypointName}.d.cts`,
                default: `./${entrypointName}.cjs`,
            }
        })
    }

    result.exports = Object.fromEntries(newExports)
    return { packageJson: result, entrypoints, entrypointsToCopy }
}

function transformBin(packageJson: PackageJson): { packageJson: PackageJson; entrypoints: Map<string, string> } {
    let result = { ...packageJson }
    let entrypoints = new Map<string, string>()

    if (result.bin == null) {
        return { packageJson: result, entrypoints }
    }

    let newBin = new Map<string, string>()

    for (let [key, value] of Object.entries(result.bin as Record<string, unknown>)) {
        if (typeof value !== "string") {
            throw new TypeError(`package.json bin value must be a string: ${key}.`)
        }

        let entrypointName = key.replace(/^\.(?:\/|$)/, '').replace(/\.js$/, '')
        if (entrypointName === "") entrypointName = "index"

        entrypoints.set(entrypointName, value)
        newBin.set(key, `${entrypointName}.js`)
    }

    result.bin = Object.fromEntries(newBin)
    return { packageJson: result, entrypoints }
}

export function processPackageJson(params: ProcessPackageJsonParams): ProcessPackageJsonReturn {
    let {
        packageJson: packageJsonOriginal,
        onlyEntrypoints = false,
        workspaceVersions,
        rootPackageJson,
        rootFieldsToCopy = DefaultFieldsToCopyRoot,
        shouldCopyEntrypoint = DefaultShouldCopyEntrypoint,
        bundledWorkspaceDeps,
        fixedVersion,
    } = params

    let packageJson = structuredClone(packageJsonOriginal)
    let entrypoints = new Map<string, string>()
    let entrypointsToCopy = new Map<string, string>()

    if (!onlyEntrypoints) {
        packageJson = copyRootFields(packageJson, rootPackageJson, rootFieldsToCopy)
        packageJson = filterKeepScripts(packageJson)
        packageJson = applyDistOnlyFields(packageJson)
        packageJson = replaceWorkspaceDependencies(packageJson, workspaceVersions, bundledWorkspaceDeps, fixedVersion)

        delete packageJson.typedoc
        delete packageJson.eslintConfig
        delete packageJson.eslintIgnore
        delete packageJson.prettier
        delete packageJson.yorozu
    }

    if (packageJson.exports != null) {
        let exportsResult = transformExports(packageJson, shouldCopyEntrypoint)
        packageJson = exportsResult.packageJson
        entrypointsToCopy = exportsResult.entrypointsToCopy
        for (let [k, v] of exportsResult.entrypoints) entrypoints.set(k, v)
    }

    if (packageJson.bin != null) {
        let binResult = transformBin(packageJson)
        packageJson = binResult.packageJson
        for (let [k, v] of binResult.entrypoints) entrypoints.set(k, v)
    }

    return {
        packageJson,
        packageJsonOriginal,
        entrypoints,
        entrypointsToCopy
    }
}

export function removeCommonjsExports(exports: Record<string, unknown>) {
    let keys = Object.keys(exports)
    if (keys.includes("import")) {
        delete exports.require
        return
    }

    for (let key of keys) {
        let value = exports[key]
        if (value == null || typeof value !== "object") continue
        delete (value as Record<string, unknown>).require
    }
}