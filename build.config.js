/** @type {import("@yorozu/build").RootConfig} */
export default {
    versioning: {
        taggingSchema: "semver",
    },
    jsr: {
        exclude: ["**/*.unit.ts", "**/__fixtures__/**"],
        sourceDir: "src",
    },
}
