import {defineConfig, type ViteUserConfigFnObject} from "vitest/config";

const config: ViteUserConfigFnObject = defineConfig(() => ({
    test: {
        include: ["packages/**/*.unit.ts"]
    }
}))

export default config