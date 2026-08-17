/** @type {import("@yorozu/build/vite").CustomBuildConfig} */
export default {
    viteConfig: {
        build: {
            lib: {
                formats: ['es']
            }
        }
    },
    preparePackageJson({ packageJson }) {
        delete packageJson.exports["./vite-internal"]
        packageJson.exports["./vite"] = "./dist_vite-internal.js"
        packageJson.bin = { "yorozu-build": "./src/cli/main.ts" }
    },
}
