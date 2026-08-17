import process from "node:process"
import { info, warn } from "../../log"
import { bc, loadConfig, resolveWorkspaceRoot } from "../_utils"
import type { PreferProtectedError } from "./validate-prefer-protected"
import { validatePreferProtected } from "./validate-prefer-protected"
import type { InternalDepsError } from "./validate-workspace-deps"
import { validateWorkspaceDeps } from "./validate-workspace-deps"

const INTERNAL_MESSAGES: Record<InternalDepsError["subtype"], string> = {
    not_workspace_proto: "internal dependencies must be linked with workspace: protocol",
    not_workspace_dep: "workspace: protocol is used to link to a package not found in the workspace",
}

export { validatePreferProtected }
export type { PreferProtectedError } from "./validate-prefer-protected"
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
        let depErrors = await validateWorkspaceDeps({
            workspaceRoot,
            config,
        })
        let memberErrors = await validatePreferProtected({
            workspaceRoot,
            config,
        })

        if (depErrors.length === 0) {
            info("workspace dependencies look good")
        } else {
            reportDepErrors(depErrors)
        }

        if (memberErrors.length === 0) {
            info("class members look good")
        } else {
            reportMemberErrors(memberErrors)
        }

        if (depErrors.length === 0 && memberErrors.length === 0) return

        if (!args.noErrorCode) {
            process.exit(1)
        }
    },
})

function reportDepErrors(errors: Awaited<ReturnType<typeof validateWorkspaceDeps>>): void {
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
}

function reportMemberErrors(errors: Array<PreferProtectedError>): void {
    warn("Found private / # class members (use protected):")
    for (let item of errors) {
        let label = item.kind === "private_identifier" ? `#${item.name}` : `private ${item.name}`
        let hint = item.kind === "private_identifier" ? `protected ${item.name.startsWith("_") ? item.name : `_${item.name}`}` : "protected"
        warn(`  - at ${item.file}:${item.line}:${item.column}: ${label} — use ${hint}`)
    }
}
