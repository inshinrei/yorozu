import { jsrCreatePackages } from "../../jsr/create-packages"
import { generateDenoWorkspace } from "../../jsr/generate-workspace"
import { populateFromUpstream } from "../../jsr/populate"
import { info } from "../log"
import { bc, loadConfig, resolveWorkspaceRoot } from "./_utils"

let populate = bc.command({
    name: "populate",
    desc: "populate a local JSR instance with packages from an upstream registry",
    options: {
        upstream: bc.string().desc("URL of the upstream registry (default: process.env.JSR_URL)"),
        createViaApi: bc.boolean("create-via-api").desc("create packages via the API instead of manually via web UI"),
        packages: bc
            .string()
            .desc("comma-separated list of packages to populate (with version, e.g. `@std/fs@0.105.0`)")
            .required(),
        downstream: bc.string().desc("URL of the downstream local registry").required(),
        token: bc.string().desc("API token"),
        quiet: bc.boolean().alias("q").desc("suppress output"),
        publishArgs: bc.string("publish-args").desc("Additional arguments to pass to `deno publish`"),
    },
    transform: args => {
        return {
            ...args,
            packages: args.packages.split(",").map(item => item.trim()),
            publishArgs: args.publishArgs?.split(" "),
        }
    },
    handler: populateFromUpstream,
})

let createPackages = bc.command({
    name: "create-packages",
    desc: "create missing packages from the workspace",
    options: {
        registry: bc.string("registry").desc("URL of the registry to publish to").default("https://jsr.io"),
        root: bc.string().desc("path to the root of the workspace (default: cwd)"),
        token: bc.string("token").desc("token to use for managing the packages"),
        githubRepo: bc.string("github-repo").desc("github repo to set for the package (requires --token)"),
    },
    handler: async args => {
        let hasFailed = await jsrCreatePackages({
            workspaceRoot: resolveWorkspaceRoot(args.root),
            registry: args.registry,
            token: args.token,
            githubRepo: args.githubRepo,
        })

        if (!hasFailed) {
            info("all packages were published")
        }
    },
})

let generateDenoWorkspaceCli = bc.command({
    name: "gen-deno-workspace",
    desc: "generate a deno workspace for jsr publishing",
    options: {
        workspaceRoot: bc.string("root").desc("path to the root of the workspace (default: cwd)"),
        withDryRun: bc.boolean("with-dry-run").desc("whether to run `deno publish --dry-run` after generating the workspace"),
    },
    handler: async args => {
        let workspaceRoot = resolveWorkspaceRoot(args.workspaceRoot)
        let rootConfig = await loadConfig({
            workspaceRoot,
        })

        let outDir = await generateDenoWorkspace({
            workspaceRoot,
            rootConfig: rootConfig?.jsr,
            withDryRun: args.withDryRun,
        })

        info(`deno workspace generated at ${outDir}`)
    },
})

export let jsrCli = bc.command({
    name: "jsr",
    desc: "jsr-related commands",
    subcommands: [populate, createPackages, generateDenoWorkspaceCli],
})
