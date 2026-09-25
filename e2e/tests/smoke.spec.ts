import { expect, test } from "@playwright/test"

test("harness index is up", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Yorozu e2e" })).toBeVisible()
})
