import process from "node:process"
import type { RootConfigObject } from "../config"
import { loadBuildConfig } from "../misc/_config"
import { bc } from "./commands/_utils"
import { generateDocsCli } from "./commands/docs"
import { jsrCli } from "./commands/jsr"
import { validatePreferProtected } from "./commands/lint/validate-prefer-protected"

let args = process.argv.slice(2)
if (args[0] === "prefer-protected") {
    let root = "."
    for (let i = 1; i < args.length; i++) {
        let arg = args[i]
        if (arg === "--root") {
            root = args[i + 1] ?? "."
            i++
            continue
        }
        if (arg.startsWith("--root=")) {
            root = arg.slice("--root=".length)
        }
    }
    let loaded = await loadBuildConfig<RootConfigObject>(root)
    let errors = await validatePreferProtected({ workspaceRoot: root, config: loaded?.lint })
    console.log(JSON.stringify(errors))
} else {
    await bc.run([generateDocsCli, jsrCli], {
        theme: event => {
            if (event.type === "error" && event.violation === "unknown_error") {
                let err = event.error instanceof Error ? event.error : new Error(String(event.error))
                process.stderr.write(`${err.stack ?? err.message}\n`)
                process.exit(1)
            }
            return false
        },
    })
}
