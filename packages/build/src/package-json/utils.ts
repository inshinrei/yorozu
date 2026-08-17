import type { WorkspacePackage } from "./collect-package-jsons"

export function findPackageByName(packages: Array<WorkspacePackage>, name: string): WorkspacePackage {
    let pkg = packages.find(item => item.json.name === name)
    if (!pkg) {
        throw new Error(`Could not find package.json for ${name}`)
    }
    return pkg
}

export function findRootPackage(packages: Array<WorkspacePackage>): WorkspacePackage {
    let pkg = packages.find(item => item.root)
    if (!pkg) {
        throw new Error("Could not find package.json for workspace root")
    }
    return pkg
}

export function collectVersions(packages: Array<WorkspacePackage>): Map<string, string> {
    let versions = new Map<string, string>()

    for (let pkg of packages) {
        if (pkg.root || pkg.json.name == null || pkg.json.version == null) continue
        versions.set(pkg.json.name, pkg.json.version)
    }

    return versions
}
