#!/usr/bin/env node
import process from "node:process"
import { error } from "./log"
import { bc } from "./commands/_utils"
import { lintCli } from "./commands/lint/index"
import { buildPackageCli } from "./commands/build"
import { publishPackagesCli } from "./commands/publish"
import { bumpVersionCli } from "./commands/bump-version"
import { generateChangelogCli } from "./commands/gen-changelog"
import { findChangedPackagesCli } from "./commands/find-changed-packages"
import { releaseCli } from "./commands/release"
import { jsrCli } from "./commands/jsr"
import { generateDocsCli } from "./commands/docs"
import { generateDepsGraphCli } from "./commands/gen-deps-graph"
import { runContinuousReleaseCli } from "./commands/cr"

await bc.run(
    [
        lintCli,
        buildPackageCli,
        publishPackagesCli,
        bumpVersionCli,
        generateChangelogCli,
        findChangedPackagesCli,
        releaseCli,
        jsrCli,
        generateDocsCli,
        generateDepsGraphCli,
        runContinuousReleaseCli,
    ],
    {
        theme: event => {
            if (event.type === "error" && event.violation === "unknown_error") {
                error(event.error instanceof Error ? event.error : new Error(String(event.error)))
                process.exit(1)
            }

            return false
        },
    },
)
