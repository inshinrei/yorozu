import { isRunningInGithubActions, writeGithubActionsOutput } from "../../ci/github-actions"
import { getLatestTag } from "../../git/utils"
import { findProjectChangedPackages } from "../../versioning/collect-files"
import { info } from "../log"
import { bc, loadConfig, resolveWorkspaceRoot } from "./_utils"

export let findChangedPackagesCli = bc.command({
    name: "find-changed-packages",
    desc: "find changed packages between two commits, and output a comma-separated list of package names",
    options: {
        root: bc.string().desc("path to the root of the workspace (default: process.cwd())"),
        since: bc.string().desc("starting point for the changelog (default: latest tag)"),
        until: bc.string().desc("ending point for the changelog (default: HEAD)"),
    },
    handler: async args => {
        let root = resolveWorkspaceRoot(args.root)

        let config = await loadConfig({
            workspaceRoot: root,
            require: false,
        })

        let since = args.since ?? (await getLatestTag(root))
        if (since == null) {
            throw new Error("no previous tag found, cannot determine changeset")
        }

        let list = await findProjectChangedPackages({
            params: config?.versioning,
            root,
            since,
            until: args.until,
        })

        let result = list.map(pkg => pkg.json.name).join(",")
        if (isRunningInGithubActions()) {
            writeGithubActionsOutput("packages", result)
            info("Written packages to `packages` output")
        } else {
            info(result)
        }
    },
})
