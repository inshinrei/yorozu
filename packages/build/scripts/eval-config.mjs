import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

let configPath = resolve(process.argv[2] ?? "build.config.js")
let mod = (await import(pathToFileURL(configPath).href)).default
if (typeof mod === "function") {
    mod = await mod()
}
console.log(JSON.stringify(mod, (_key, value) => (typeof value === "function" ? undefined : value)))
