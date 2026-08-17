import { asNonNull } from "@yorozu/utils"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"

export function sortWorkspaceByPublishOrder(packages: Array<WorkspacePackage>): Array<WorkspacePackage> {
    let workspacePackages = new Map<string, WorkspacePackage>()
    for (let pkg of packages) {
        if (pkg.json.name == null) continue
        workspacePackages.set(pkg.json.name, pkg)
    }

    let dependencies: Record<string, Array<string>> = {}

    for (let pkg of packages) {
        if (pkg.json.name == null) continue

        let list: Array<string> = []

        for (let key of ["dependencies", "peerDependencies"] as const) {
            let deps = pkg.json[key]
            if (!deps) continue

            for (let name in deps) {
                if (workspacePackages.has(name)) {
                    list.push(name)
                }
            }
        }

        dependencies[pkg.json.name] = list
    }

    let order = determinePublishOrder(dependencies)

    let result: Array<WorkspacePackage> = []
    for (let name of order) {
        result.push(asNonNull(workspacePackages.get(name)))
    }
    return result
}

export function determinePublishOrder(dependencies: Record<string, Array<string>>): Array<string> {
    let result: Array<string> = []
    let visited = new Set<string>()
    let visiting = new Set<string>()

    function visit(name: string) {
        if (visited.has(name)) return
        if (!(name in dependencies)) return
        if (visiting.has(name)) {
            throw new Error(`Circular dependency detected: ${name}`)
        }

        visiting.add(name)

        for (let dep of dependencies[name] ?? []) {
            visit(dep)
        }

        visiting.delete(name)
        visited.add(name)
        result.push(name)
    }

    for (let name in dependencies) {
        visit(name)
    }

    return result
}
