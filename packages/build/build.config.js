import { writeFile } from "node:fs/promises"
import { builtinModules } from "node:module"
import { join } from "node:path"

let nodeBuiltins = [...builtinModules, ...builtinModules.map(name => `node:${name}`)]

/** @type {import("@yorozu/build/vite").CustomBuildConfig} */
export default {
    viteConfig: {
        build: {
            lib: {
                formats: ["es"],
            },
            rollupOptions: {
                external: [
                    "vite",
                    "typescript",
                    "typedoc",
                    /^vite\//,
                    /^typescript\//,
                    /^typedoc\//,
                    ...nodeBuiltins,
                ],
            },
        },
    },
    preparePackageJson({ packageJson }) {
        delete packageJson.exports["./vite-internal"]
        packageJson.exports["./vite"] = "./src/vite/index.ts"
    },
    async finalize({ outDir }) {
        await writeFile(join(outDir, "vite.d.ts"), 'export * from "./vite/index.js"\n')
    },
}
