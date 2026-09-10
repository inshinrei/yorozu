import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    resolve: {
        alias: {
            "@yorozu/media-viewer": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
            "@yorozu/animations": fileURLToPath(new URL("../../animations/src/index.ts", import.meta.url)),
        },
    },
    server: { port: 5178 },
})
