import { collectPackageJsons } from "../../package-json/collect-package-jsons"
import { info } from "../log"
import { bc, resolveWorkspaceRoot } from "./_utils"

export async function generateDepsGraph(params: {
    workspaceRoot: string | URL
    includeRoot?: boolean
    includeExternal?: boolean
}): Promise<string> {
    let { workspaceRoot, includeRoot = false, includeExternal = false } = params

    let pjs = await collectPackageJsons(workspaceRoot, includeRoot)
    let workspacePackages = new Set<string>()

    let commonPrefix: string | undefined
    for (let { json: pj } of pjs) {
        if (pj.name === undefined) continue

        workspacePackages.add(pj.name)

        let [org, name] = pj.name.split("/")
        if (!name) {
            commonPrefix = undefined
            break
        }

        if (commonPrefix === undefined) {
            commonPrefix = org
        } else if (commonPrefix !== org) {
            commonPrefix = undefined
            break
        }
    }

    const getName = (name: string) => {
        if (commonPrefix !== undefined) {
            let [org, pkg] = name.split("/")
            if (org === commonPrefix) {
                return pkg
            }
        }

        return name
    }

    let lines: Array<string> = []
    for (let { json: pj } of pjs) {
        if (pj.name === undefined) continue
        let name = getName(pj.name)

        for (let dep of Object.keys(pj.dependencies || {})) {
            if (!workspacePackages.has(dep) && !includeExternal) continue
            lines.push(`"${name}" -> "${getName(dep)}"`)
        }

        for (let dep of Object.keys(pj.devDependencies || {})) {
            if (!workspacePackages.has(dep) && !includeExternal) continue
            lines.push(`"${name}" -> "${getName(dep)}" [style=dashed,color=grey]`)
        }
    }

    return `digraph {\n${lines.join("\n")}\n}`
}

export let generateDepsGraphCli = bc.command({
    name: "gen-deps-graph",
    desc: "generate a graphviz dot file of the workspace dependencies",
    options: {
        includeRoot: bc.boolean("include-root").desc("whether to include the root package.json in the graph"),
        includeExternal: bc.boolean("include-external").desc("whether to include external dependencies in the graph"),
        root: bc.string().desc("path to the root of the workspace (default: cwd)"),
    },
    handler: async args => {
        let dot = await generateDepsGraph({
            workspaceRoot: resolveWorkspaceRoot(args.root),
            includeRoot: args.includeRoot,
            includeExternal: args.includeExternal,
        })

        info(dot)
    },
})
