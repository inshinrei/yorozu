#!/usr/bin/env node
import process from "node:process"
import { error } from "./log"
import { bc } from "./commands/_utils"
import { buildPackageCli } from "./commands/build"
import { publishPackagesCli } from "./commands/publish"

await bc.run([buildPackageCli, publishPackagesCli], {
    theme: event => {
        if (event.type === "error" && event.violation === "unknown_error") {
            error(event.error instanceof Error ? event.error : new Error(String(event.error)))
            process.exit(1)
        }

        return false
    },
})
