import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

function src(pkg: string): string {
    return fileURLToPath(new URL(`../packages/${pkg}/src`, import.meta.url))
}

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    resolve: {
        alias: {
            "@yorozu/animations": `${src("animations")}/index.ts`,
            "@yorozu/confirm-tooltip": `${src("confirm-tooltip")}/index.ts`,
            "@yorozu/confirm-tooltip/default.css": `${src("confirm-tooltip")}/default.css`,
            "@yorozu/confirm-tooltip/tokens.css": `${src("confirm-tooltip")}/tokens.css`,
            "@yorozu/context-menu": `${src("context-menu")}/index.ts`,
            "@yorozu/context-menu/default.css": `${src("context-menu")}/default.css`,
            "@yorozu/context-menu/tokens.css": `${src("context-menu")}/tokens.css`,
            "@yorozu/media-viewer": `${src("media-viewer")}/index.ts`,
            "@yorozu/media-viewer/default.css": `${src("media-viewer")}/default.css`,
            "@yorozu/media-viewer/tokens.css": `${src("media-viewer")}/tokens.css`,
            "@yorozu/sortable": `${src("sortable")}/index.ts`,
            "@yorozu/virtual-list": `${src("virtual-list")}/index.ts`,
        },
    },
    server: { port: 5180, strictPort: true },
})
