import { defineConfig } from "vitest/config"
import dts from "vite-plugin-dts"
import { yorozuBuild } from "@yorozu/build/vite"

export default defineConfig(async () => {
    let buildPlugins = await yorozuBuild({
        root: import.meta.dirname,
        insertTypesEntry: true,
    })
    return {
        plugins: [
            ...buildPlugins,
            dts({ tsconfigPath: "tsconfig.json", exclude: ["**/*.unit.ts"] }),
        ],
        test: {
            include: ["packages/**/*.unit.ts"],
        },
    }
})
