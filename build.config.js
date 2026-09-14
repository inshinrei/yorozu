/** @type {import("@yorozu/build").RootConfig} */
export default {
    versioning: {
        taggingSchema: "semver",
    },
    jsr: {
        exclude: ["**/*.unit.ts", "**/__fixtures__/**", "**/playground/**"],
        sourceDir: "src",
    },
}
