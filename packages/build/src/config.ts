import type { AnyToNever, MaybePromise } from "@yorozu/utils"
import type { TypeDocOptions } from "typedoc"
import type { WorkspacePackage } from "./package-json/collect-package-jsons"
import type { PackageJson } from "./package-json/types"

export interface BuildHookContext {
    outDir: string
    packageDir: string
    packageName: string
    /**
     * package.json of the package being built.
     * should not be modified unless the hook docs allow it
     */
    packageJson: PackageJson
    jsr: boolean
    typedoc: boolean
}

export interface JsrConfig {
    outputDir?: string
    copyRootFiles?: Array<string>
    copyPackageFiles?: Array<string>
    sourceDir?: string
    exclude?: Array<string>
    includePackage?: (pkg: WorkspacePackage) => boolean
    dryRun?: boolean
    finalizeDenoJson?: (ctx: BuildHookContext, jsr: Record<string, unknown>) => void
    finalize?: (ctx: BuildHookContext) => MaybePromise<void>
}

export interface LintConfig {
    includeRoot?: boolean
    externalDependencies?: {
        enabled?: boolean
        skipPeerDependencies?: boolean
        shouldSkip?: (ctx: {
            package: WorkspacePackage
            dependency: string
            version: string
            field: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies"
        }) => boolean
    }
}

export interface VersioningOptions {
    taggingSchema?: "semver" | "date"
    include?: Array<string> | null
    exclude?: Array<string> | null
    bumpWithDependants?: boolean | "only-minor"
    beforeReleaseCommit?: (workspace: Array<WorkspacePackage>) => MaybePromise<void>
}

export interface RootConfigObject {
    viteConfig?: string
    jsr?: JsrConfig
    versioning?: VersioningOptions
    typedoc?: AnyToNever<
        Omit<Partial<TypeDocOptions>, "entryPoints" | "entryPointStrategy" | "extends"> & {
            includePackages?: Array<string>
            excludePackages?: Array<string>
        }
    >
    lint?: LintConfig
}

export type RootConfig = RootConfigObject | (() => RootConfigObject)
