import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

function src(pkg: string): string {
    return fileURLToPath(new URL(`../packages/${pkg}/src`, import.meta.url))
}

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    resolve: {
        alias: [
            { find: "@yorozu/confirm-tooltip/default.css", replacement: `${src("confirm-tooltip")}/default.css` },
            { find: "@yorozu/confirm-tooltip/tokens.css", replacement: `${src("confirm-tooltip")}/tokens.css` },
            { find: "@yorozu/context-menu/default.css", replacement: `${src("context-menu")}/default.css` },
            { find: "@yorozu/context-menu/tokens.css", replacement: `${src("context-menu")}/tokens.css` },
            { find: "@yorozu/media-viewer/default.css", replacement: `${src("media-viewer")}/default.css` },
            { find: "@yorozu/media-viewer/tokens.css", replacement: `${src("media-viewer")}/tokens.css` },
            { find: "@yorozu/animations", replacement: `${src("animations")}/index.ts` },
            { find: "@yorozu/confirm-tooltip", replacement: `${src("confirm-tooltip")}/index.ts` },
            { find: "@yorozu/context-menu", replacement: `${src("context-menu")}/index.ts` },
            { find: "@yorozu/media-viewer", replacement: `${src("media-viewer")}/index.ts` },
            { find: "@yorozu/sortable", replacement: `${src("sortable")}/index.ts` },
            { find: "@yorozu/virtual-list", replacement: `${src("virtual-list")}/index.ts` },
        ],
    },
    server: { port: 5180, strictPort: true },
})
