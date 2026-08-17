import type { WorkspacePackage } from "../../package-json/collect-package-jsons"
import type { BumpVersionResult } from "../../versioning/bump-version"
import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import process from "node:process"
import { asNonNull, parallelMap } from "@yorozu/utils"
import { isRunningInGithubActions, writeGithubActionsOutput } from "../../ci/github-actions"
import { createGithubRelease } from "../../git/github"
import { getLatestTag, gitTagExists } from "../../git/utils"
import { jsrCreatePackages } from "../../jsr/create-packages"
import { generateDenoWorkspace } from "../../jsr/generate-workspace"
import { getWorkspaceRoot } from "../../misc/_config"
import { exec, ExecError } from "../../misc/exec"
import { sortWorkspaceByPublishOrder } from "../../misc/publish-order"
import { collectPackageJsons, filterPackageJsonsForPublish } from "../../package-json/collect-package-jsons"
import { findRootPackage } from "../../package-json/utils"
import { bumpVersion } from "../../versioning/bump-version"
import { generateChangelog } from "../../versioning/generate-changelog"
import { info } from "../log"
import { bc, loadConfig } from "./_utils"
import { formatBumpVersionResult } from "./bump-version"
import { publishPackages } from "./publish"

function npmPublishList(workspace: Array<WorkspacePackage>): Array<WorkspacePackage> {
    return filterPackageJsonsForPublish(
        sortWorkspaceByPublishOrder(workspace.filter(pkg => !pkg.root)),
        "npm",
    )
}

function printPublishList(packages: Array<WorkspacePackage>): void {
    info("publish list:")
    if (packages.length === 0) {
        info("  (none)")
        return
    }
    for (let pkg of packages) {
        info(`  ${pkg.json.name}@${pkg.json.version}`)
    }
}

async function nextDateTag(root: string): Promise<string> {
    let date = new Date()
    let tagNamePrefix = `v${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getDate().toString().padStart(2, "0")}`
    let currentSuffix = "a"
    let tagName = `${tagNamePrefix}${currentSuffix}`

    while (await gitTagExists(tagName, root)) {
        if (currentSuffix === "z") {
            throw new Error("Too many releases for today (max 26)")
        }
        currentSuffix = String.fromCharCode(currentSuffix.charCodeAt(0) + 1)
        tagName = `${tagNamePrefix}${currentSuffix}`
    }

    return tagName
}

export let releaseCli = bc.command({
    name: "release",
    desc: "release packages",
    options: {
        kind: bc.string("kind").desc("release kind").enum("major", "minor", "patch", "auto").default("auto"),

        withGithubRelease: bc
            .boolean("with-github-release")
            .desc(
                "whether to create a github release (requires GITHUB_TOKEN env var). if false, will only create a commit with the release notes",
            )
            .default(false),
        gitExtraOrigins: bc
            .string("git-extra-origins")
            .desc("extra git origins to push to (e.g. for mirrors). note that these origins will be force-pushed to"),
        githubToken: bc
            .string("github-token")
            .desc("github token to use for creating a release (defaults to GITHUB_TOKEN env var)"),
        githubRepo: bc
            .string("github-repo")
            .desc("github repo to create a release for (defaults to GITHUB_REPOSITORY env var)"),
        githubApiUrl: bc.string("github-api-url").desc("github api url to use for creating a release (for github-compatible apis)"),

        withJsr: bc.boolean("with-jsr").desc("whether to publish to jsr").default(false),
        jsrRegistry: bc.string("jsr-registry").desc("URL of the jsr registry to publish to"),
        jsrToken: bc.string("jsr-token").desc("jsr token to use for publishing"),
        jsrPublishArgs: bc.string("jsr-publish-args").desc("additional arguments to pass to `deno publish`"),
        jsrCreatePackages: bc.boolean("jsr-create-packages").desc("whether to create missing packages in jsr"),

        withNpm: bc.boolean("with-npm").desc("whether to publish to npm"),
        npmToken: bc.string("npm-token").desc("npm token to use for publishing (note: this will override the global .npmrc file)"),
        npmPublishArgs: bc.string("npm-publish-args").desc("additional arguments to pass to `npm publish`"),
        npmDistDir: bc.string("npm-dist-dir").desc("directory to publish to npm from, relative to package root (default: dist)"),
        npmRegistry: bc.string("npm-registry").desc("URL of the npm registry to publish to"),
        noProvenance: bc.boolean("no-provenance").desc("version to NOT use provenance even when it should be possible"),

        dryRun: bc.boolean("dry-run").desc("whether to skip publishing and only print what is going to happen"),
    },
    handler: async args => {
        let root = getWorkspaceRoot()
        let config = await loadConfig({
            workspaceRoot: root,
            require: false,
        })
        let workspaceWithRoot = await collectPackageJsons(root, true)
        let rootPackage = findRootPackage(workspaceWithRoot)

        let prevTag = await getLatestTag(root)
        let firstRelease = prevTag == null

        if (firstRelease) {
            info("no previous tag found, assuming this is a first ever release")
        } else {
            info(`previous tag: ${prevTag}`)
        }

        let bumpVersionResult: BumpVersionResult | undefined
        let nextVersion: string
        let changelog: string

        if (firstRelease) {
            nextVersion = asNonNull(rootPackage.json.version)
            changelog = "Initial release"
        } else {
            bumpVersionResult = await bumpVersion({
                workspace: workspaceWithRoot,
                since: prevTag,
                type: args.kind === "auto" ? undefined : args.kind,
                all: true,
                cwd: root,
                params: config?.versioning,
                dryRun: args.dryRun,
                withRoot: true,
            })

            if (bumpVersionResult.changedPackages.length === 0) {
                info("no packages changed, nothing to do")
                process.exit(1)
            }

            info(formatBumpVersionResult(bumpVersionResult, args.kind === "auto"))
            nextVersion = bumpVersionResult.nextVersion
            changelog = await generateChangelog({
                workspace: bumpVersionResult.changedPackages.map(pkg => pkg.package),
                cwd: root,
                since: prevTag,
                params: config?.versioning,
            })
        }

        let taggingSchema = config?.versioning?.taggingSchema ?? "semver"
        let tagName: string

        if (firstRelease || taggingSchema === "semver") {
            tagName = `v${nextVersion}`
            if (await gitTagExists(tagName, root)) {
                throw new Error(
                    `tag ${tagName} already exists. did the previous release complete successfully? if so, please verify versions in package.json and try again`,
                )
            }
        } else if (taggingSchema === "date") {
            tagName = await nextDateTag(root)
        } else {
            throw new Error(`Unknown tagging schema: ${String(taggingSchema)}`)
        }

        info(`next version: ${nextVersion}`)
        info(`next tag: ${tagName}`)
        info("--begin changelog--")
        info(changelog)
        info("--end changelog--")

        let toPublish = npmPublishList(workspaceWithRoot)
        printPublishList(toPublish)

        if (isRunningInGithubActions()) {
            writeGithubActionsOutput("version", nextVersion)
            writeGithubActionsOutput("tag", tagName)
            writeGithubActionsOutput("changelog", changelog)
        }

        let tarballs: Array<string> = []

        if (args.withNpm) {
            if (args.dryRun) {
                info("dry run, skipping npm publish")
            } else {
                info("publishing to npm...")

                let publishResult = await publishPackages({
                    packages: [":all"],
                    workspace: workspaceWithRoot,
                    workspaceRoot: root,
                    registryUrl: args.npmRegistry,
                    token: args.npmToken,
                    distDir: args.npmDistDir,
                    publishArgs: args.npmPublishArgs?.split(" "),
                    dryRun: args.dryRun,
                    withBuild: true,
                    withTarballs: args.withGithubRelease,
                    noProvenance: args.noProvenance,
                })

                if (publishResult.failed.length > 0) {
                    info("failed to publish:")
                    for (let pkg of publishResult.failed) {
                        info(`  ${pkg}`)
                    }
                    process.exit(1)
                }

                info("published to npm")
                tarballs = publishResult.tarballs
            }
        } else if (args.withGithubRelease) {
            throw new Error("Cannot create a github release without publishing to npm (yet)")
        }

        if (args.withJsr) {
            if (args.dryRun) {
                info("dry run, skipping jsr publish")
            } else {
                if (args.jsrCreatePackages) {
                    info("creating missing packages in jsr...")
                    let hasMissing = await jsrCreatePackages({
                        workspaceRoot: root,
                        workspacePackages: workspaceWithRoot,
                        registry: args.jsrRegistry,
                        token: args.jsrToken,
                        githubRepo: args.githubRepo,
                    })

                    if (hasMissing) {
                        info("some packages are missing, this might cause issues")
                    }
                }

                info("generating deno workspace...")
                let workspaceDir = await generateDenoWorkspace({
                    workspaceRoot: root,
                    workspacePackages: workspaceWithRoot,
                    rootConfig: config?.jsr,
                })

                info("publishing to jsr...")
                await exec(
                    [
                        "deno",
                        "publish",
                        "--quiet",
                        "--allow-dirty",
                        ...(args.jsrToken != null ? ["--token", args.jsrToken] : []),
                        ...(args.jsrPublishArgs?.split(" ") ?? []),
                    ],
                    {
                        env: {
                            ...process.env,
                            JSR_URL: args.jsrRegistry,
                        },
                        cwd: workspaceDir,
                        stdio: "inherit",
                        throwOnError: true,
                    },
                )

                info("published to jsr")
            }
        }

        if (args.dryRun) {
            info("dry run, skipping release commit and tag")
        } else {
            await config?.versioning?.beforeReleaseCommit?.(workspaceWithRoot)

            let message = `chore(release): ${tagName}`
            if (!args.withGithubRelease) {
                message += `\n\n${changelog}`
            }

            await exec(["git", "commit", "-am", message, "--allow-empty"], {
                cwd: root,
                stdio: "inherit",
                throwOnError: true,
            })

            await exec(["git", "tag", tagName, "-m", tagName], {
                cwd: root,
                stdio: "inherit",
                throwOnError: true,
            })

            await exec(["git", "push", "--follow-tags"], {
                cwd: root,
                stdio: "inherit",
                throwOnError: true,
            })

            if (args.gitExtraOrigins != null) {
                for (let origin of args.gitExtraOrigins.split(",")) {
                    await exec(["git", "push", origin, "--force"], {
                        cwd: root,
                        stdio: "inherit",
                        throwOnError: true,
                    })
                    try {
                        await exec(["git", "push", origin, "--force", "--tags"], {
                            cwd: root,
                            throwOnError: true,
                        })
                    } catch (err) {
                        if (!(err instanceof ExecError)) throw err

                        if (err.result.stderr.includes(`cannot lock ref 'refs/tags/${tagName}': reference already exists`)) {
                            info(`tag ${tagName} already exists on ${origin}, skipping`)
                        } else {
                            throw err
                        }
                    }
                }
            }
        }

        if (args.withGithubRelease) {
            if (args.dryRun) {
                info("dry run, skipping github release")
            } else {
                let token = args.githubToken ?? process.env.GITHUB_TOKEN
                if (token == null) {
                    throw new Error("github token is not set")
                }

                let repo = args.githubRepo ?? process.env.GITHUB_REPOSITORY
                if (repo == null) {
                    throw new Error("github repo is not set")
                }

                info("creating github release...")

                await createGithubRelease({
                    token,
                    repo,
                    tag: tagName,
                    name: tagName,
                    body: changelog,
                    apiUrl: args.githubApiUrl,
                    artifacts: await parallelMap(tarballs, async file => ({
                        name: basename(file),
                        type: "application/gzip",
                        body: await readFile(file),
                    })),
                })

                info(`github release created: https://github.com/${repo}/releases/tag/${tagName}`)
            }
        }

        info("done!")
    },
})
