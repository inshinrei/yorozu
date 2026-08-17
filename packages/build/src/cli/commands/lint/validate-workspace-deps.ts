import { satisfies, subset, valid, validRange } from "semver"
import { collectPackageJsons, type WorkspacePackage } from "../../../package-json/collect-package-jsons"
import type { LintConfig } from "./config"

export interface ExternalDepsError {
    type: "external"
    package: string
    dependency: string
    version: string
    at: string
    otherPackage: string
    otherVersion: string
}

export interface InternalDepsError {
    type: "internal"
    package: string
    dependency: string
    subtype: "not_workspace_proto" | "not_workspace_dep"
}

export type WorkspaceDepsError = ExternalDepsError | InternalDepsError

let DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const

function versionsCompatible(version: string, otherVersion: string): boolean {
    if (otherVersion.match(/^(?:https?:\/\/|catalog:)/)) {
        return version === otherVersion
    }
    if (valid(version) != null) {
        return satisfies(version, otherVersion)
    }
    if (validRange(version) != null) {
        return subset(otherVersion, version)
    }
    return version === otherVersion
}

export async function validateWorkspaceDeps(params: {
    workspaceRoot: string | URL
    packages?: Array<WorkspacePackage>
    config?: LintConfig
}): Promise<Array<WorkspaceDepsError>> {
    let {
        workspaceRoot,
        config: {
            includeRoot,
            externalDependencies: {
                enabled: externalDependenciesEnabled = true,
                skipPeerDependencies: externalDependenciesSkipPeerDependencies = false,
                shouldSkip: externalDependenciesShouldSkip,
            } = {},
        } = {},
    } = params

    let packages = params.packages ?? (await collectPackageJsons(workspaceRoot, includeRoot))
    let packagesMap = new Map(packages.map(pkg => [pkg.json.name, pkg]))

    let versions: Record<string, Record<string, string>> = {}
    let errors: Array<WorkspaceDepsError> = []

    for (let pkg of packages) {
        let pj = pkg.json
        if (pj.name === undefined) {
            throw new Error("package.json without name is not supported")
        }

        for (let field of DEP_FIELDS) {
            let deps = pj[field]
            if (!deps) continue

            for (let [name, version] of Object.entries(deps)) {
                if (packagesMap.has(name)) {
                    let otherPkg = packagesMap.get(name)
                    let otherPkgStandalone = Boolean(otherPkg?.json.yorozu?.standalone)

                    if (!otherPkgStandalone && !version.startsWith("workspace:")) {
                        errors.push({
                            type: "internal",
                            package: pj.name,
                            dependency: name,
                            subtype: "not_workspace_proto",
                        })
                    }
                    continue
                }

                if (version.startsWith("workspace:")) {
                    errors.push({
                        type: "internal",
                        package: pj.name,
                        dependency: name,
                        subtype: "not_workspace_dep",
                    })
                    continue
                }

                if (!externalDependenciesEnabled) continue
                if (field === "peerDependencies" && externalDependenciesSkipPeerDependencies) continue
                if (externalDependenciesShouldSkip?.({ package: pkg, dependency: name, version, field })) continue

                if (versions[name] === undefined) {
                    versions[name] = {}
                }

                for (let [pkgName, pkgDepVersion] of Object.entries(versions[name])) {
                    if (!versionsCompatible(version, pkgDepVersion)) {
                        errors.push({
                            type: "external",
                            package: pj.name,
                            dependency: name,
                            version,
                            at: field,
                            otherPackage: pkgName,
                            otherVersion: pkgDepVersion,
                        })
                    }
                }

                versions[name][pj.name] = version
            }
        }
    }

    return errors
}
