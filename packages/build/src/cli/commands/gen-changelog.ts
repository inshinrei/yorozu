import { isRunningInGithubActions, writeGithubActionsOutput } from "../../ci/github-actions"
import { getLatestTag } from "../../git/utils"
import { collectPackageJsons } from "../../package-json/collect-package-jsons"
import { generateChangelog } from "../../versioning/generate-changelog"
import { info } from "../log"
import { bc, loadConfig, resolveWorkspaceRoot } from "./_utils"

export let generateChangelogCli = bc.command({
    name: "gen-changelog",
    desc: "generate a changelog for the workspace",
    options: {
        only: bc.string().desc("comma-separated list of packages to include"),
        root: bc.string().desc("path to the root of the workspace (default: process.cwd())"),
        since: bc.string().desc("starting point for the changelog (default: latest tag)"),
    },
    handler: async args => {
        let root = resolveWorkspaceRoot(args.root)
        let config = await loadConfig({
            workspaceRoot: root,
            require: false,
        })

        let workspacePackages = await collectPackageJsons(root, false)
        if (args.only !== undefined) {
            let only = new Set(args.only.split(",").map(item => item.trim()))
            workspacePackages = workspacePackages.filter(pkg => pkg.json.name != null && only.has(pkg.json.name))
        }

        let since = args.since ?? (await getLatestTag(root))
        if (since == null) {
            throw new Error("no previous tag found, cannot determine changeset")
        }

        let changelog = await generateChangelog({
            workspace: workspacePackages,
            cwd: root,
            since,
            params: config?.versioning,
        })

        if (isRunningInGithubActions()) {
            writeGithubActionsOutput("changelog", changelog)
            info("Written changelog to `changelog` output")
        } else {
            info(changelog)
        }
    },
})
