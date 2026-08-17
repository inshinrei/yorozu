import process from "node:process"
import { info, warn } from "../../log"
import { bc, loadConfig, resolveWorkspaceRoot } from "../_utils"
import type { InternalDepsError } from "./validate-workspace-deps"
import { validateWorkspaceDeps } from "./validate-workspace-deps"

const INTERNAL_MESSAGES: Record<InternalDepsError["subtype"], string> = {
    not_workspace_proto: "internal dependencies must be linked with workspace: protocol",
    not_workspace_dep: "workspace: protocol is used to link to a package not found in the workspace",
}

export { validateWorkspaceDeps }
export type { ExternalDepsError, InternalDepsError, WorkspaceDepsError } from "./validate-workspace-deps"

export let lintCli = bc.command({
    name: "lint",
    desc: "check the workspace for any issues",
    options: {
        workspace: bc.string().desc("path to the workspace root (default: cwd)"),
        noErrorCode: bc.boolean("no-error-code").desc("whether to always exit with a zero code").default(false),
    },
    handler: async args => {
        let workspaceRoot = resolveWorkspaceRoot(args.workspace)

        let config = (await loadConfig({ workspaceRoot }))?.lint
        let errors = await validateWorkspaceDeps({
            workspaceRoot,
            config,
        })

        if (errors.length === 0) {
            info("workspace dependencies look good")
            return
        }

        let externalErrors = errors.filter(item => item.type === "external")
        let internalErrors = errors.filter(item => item.type === "internal")

        if (externalErrors.length > 0) {
            warn("Found external dependencies mismatch:")
            for (let item of externalErrors) {
                warn(
                    `  - at ${item.package}: ${item.at} has ${item.dependency}@${item.version}, but ${item.otherPackage} has @${item.otherVersion}`,
                )
            }
        }

        if (internalErrors.length > 0) {
            warn("Found issues with internal dependencies:")
            for (let item of internalErrors) {
                warn(`  - at ${item.package}, dependency ${item.dependency}: ${INTERNAL_MESSAGES[item.subtype]}`)
            }
        }

        if (!args.noErrorCode) {
            process.exit(1)
        }
    },
})
