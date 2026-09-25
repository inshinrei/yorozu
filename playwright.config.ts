import { defineConfig, devices } from "@playwright/test"

const PORT: number = 5180

export default defineConfig({
    testDir: "./e2e/tests",
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [["github"], ["list"]] : "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${String(PORT)}`,
        trace: "on-first-retry",
    },
    webServer: {
        command: "pnpm exec vite --config e2e/vite.config.ts",
        url: `http://localhost:${String(PORT)}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [
        { name: "smoke", testMatch: /smoke\.spec\.ts/ },
        { name: "confirm-tooltip", testMatch: /confirm-tooltip\.spec\.ts/ },
        { name: "context-menu", testMatch: /context-menu.*\.spec\.ts/ },
        { name: "media-viewer", testMatch: /media-viewer.*\.spec\.ts/ },
        { name: "sortable", testMatch: /sortable\.spec\.ts/ },
        { name: "virtual-list", testMatch: /virtual-list\.spec\.ts/ },
    ],
})
