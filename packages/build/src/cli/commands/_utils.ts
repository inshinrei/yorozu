import type { RootConfigObject } from "../../config"
import { resolve } from "node:path"
import process from "node:process"
import * as bc from "@drizzle-team/brocli"
import { getWorkspaceRoot, loadBuildConfig } from "../../misc/_config"

export { bc }

export function resolveWorkspaceRoot(root?: string): string {
    return root != null ? resolve(process.cwd(), root) : getWorkspaceRoot()
}

export async function loadConfig(params: {
    workspaceRoot: string
    require?: boolean
}): Promise<RootConfigObject | null> {
    let { workspaceRoot, require = false } = params

    let config = await loadBuildConfig<RootConfigObject>(workspaceRoot)

    if (!config && require) {
        throw new Error(`Config not found at ${workspaceRoot}`)
    }

    return config ?? null
}
