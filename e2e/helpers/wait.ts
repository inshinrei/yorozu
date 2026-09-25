import { expect, type Locator } from "@playwright/test"

export async function waitOpacity(locator: Locator, value: "0" | "1"): Promise<void> {
    await expect(locator).toHaveCSS("opacity", value)
}

export async function waitGone(locator: Locator): Promise<void> {
    await expect(locator).toHaveCount(0)
}
