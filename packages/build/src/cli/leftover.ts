import process from "node:process"
import type { RootConfigObject } from "../config"
import { loadBuildConfig } from "../misc/_config"
import { validatePreferProtected } from "./commands/lint/validate-prefer-protected"

let args = process.argv.slice(2)
let command = args[0]
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

if (command !== "prefer-protected") {
    process.stderr.write(`unknown leftover command ${command ?? ""}\n`)
    process.exit(1)
}

let loaded = await loadBuildConfig<RootConfigObject>(root)
let errors = await validatePreferProtected({ workspaceRoot: root, config: loaded?.lint })
console.log(JSON.stringify(errors))
