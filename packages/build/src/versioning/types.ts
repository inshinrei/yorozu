import type { MaybePromise } from "@yorozu/utils"
import type { CommitInfo, ConventionalCommit } from "../git/utils"
import type { WorkspacePackage } from "../package-json/collect-package-jsons"
import type { ProjectChangedFile } from "./collect-files"

export interface ChangelogGeneratorParams {
    onCommitParseFailed?: (commit: CommitInfo) => void
    onCommitsFetched?: (commits: Array<CommitInfo>) => Promise<void>
    commitFilter?: (commit: CommitInfo, parsed: ConventionalCommit) => boolean
    commitFilterWithFiles?: (commit: CommitInfo, parsed: ConventionalCommit, files: Array<string>) => boolean
    commitFormatter?: (commit: CommitInfo, parsed: ConventionalCommit, files: Array<string>) => string
    packageCommitsFormatter?: (packageName: string, commits: Record<string, string>) => string
}

export interface VersioningOptions {
    taggingSchema?: "semver" | "date"
    include?: Array<string> | null
    exclude?: Array<string> | null
    bumpWithDependants?: boolean | "only-minor"
    shouldInclude?: (file: ProjectChangedFile) => MaybePromise<boolean>
    changelog?: ChangelogGeneratorParams
    beforeReleaseCommit?: (workspace: Array<WorkspacePackage>) => MaybePromise<void>
}
