import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import process from "node:process"
import { collectPackageJsons, filterPackageJsonsForPublish } from "../package-json/collect-package-jsons"
import { info } from "../cli/log"
import { jsrMaybeCreatePackage, jsrSetGithubRepo } from "./utils/jsr-api"
import { jsrCheckVersion } from "./utils/jsr"

export async function jsrCreatePackages(params: {
    workspaceRoot: string
    workspacePackages?: Array<WorkspacePackage>
    registry?: string
    token?: string
    githubRepo?: string
}): Promise<boolean> {
    let { workspaceRoot, registry = process.env.JSR_URL ?? "https://jsr.io", token, githubRepo } = params
    let workspace = filterPackageJsonsForPublish(
        params.workspacePackages ?? (await collectPackageJsons(workspaceRoot, false)),
        "jsr",
    )
    let hasFailed = false

    for (let pkg of workspace) {
        if (pkg.json.name == null) continue

        if (await jsrCheckVersion({ registry, package: pkg.json.name })) {
            continue
        }

        let [scope_, packageName] = pkg.json.name.split("/")
        let scope = scope_.startsWith("@") ? scope_.slice(1) : scope_

        if (token == null) {
            info(
                `to create ${pkg.json.name} follow this link: ${new URL(`/create?scope=${scope}&package=${packageName}`, registry).href}`,
            )
            hasFailed = true
            continue
        }

        await jsrMaybeCreatePackage({
            name: pkg.json.name,
            registry,
            token,
        })

        if (githubRepo != null) {
            let [owner, repo] = githubRepo.split("/")
            await jsrSetGithubRepo({
                registry,
                name: pkg.json.name,
                token,
                owner,
                repo,
            })
        }
    }

    return hasFailed
}
