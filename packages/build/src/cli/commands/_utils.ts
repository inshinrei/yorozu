import type { RootConfigObject } from "../../config"
import * as bc from "@drizzle-team/brocli"
import { loadBuildConfig } from "../../misc/_config"

export { bc }

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
