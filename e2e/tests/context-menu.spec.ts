import { expect, test, type Page } from "@playwright/test"
import { waitGone, waitOpacity } from "../helpers/wait"

const waitMs = async (ms: number): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

const openMenu = async (page: Page): Promise<void> => {
    await page.goto("/context-menu.html")
    await page.locator("#menu-target").click({ button: "right" })
    await waitOpacity(page.locator("[data-yorozu-menu]").first(), "1")
}

test("K1 right-click shows menu", async ({ page }) => {
    await page.goto("/context-menu.html")
    await page.locator("#menu-target").click({ button: "right" })
    await waitOpacity(page.locator("[data-yorozu-menu]"), "1")
})

test("K2 Escape hides", async ({ page }) => {
    await openMenu(page)
    await page.keyboard.press("Escape")
    await waitGone(page.locator("[data-yorozu-menu]"))
})

test("K3 hover #item-sub opens after delay", async ({ page }) => {
    await openMenu(page)
    await page.locator("#item-sub").hover()
    await waitMs(100)
    expect(await page.locator('[data-yorozu-menu][data-menu="sub"]').count()).toBe(0)
    await waitMs(60)
    await waitOpacity(page.locator('[data-yorozu-menu][data-menu="sub"]'), "1")
})

test("K5 click stay keeps menu; click close hides", async ({ page }) => {
    await openMenu(page)
    await page.locator("#item-stay").click()
    await waitOpacity(page.locator("[data-yorozu-menu]"), "1")
    await page.locator("#item-close").click()
    await waitGone(page.locator("[data-yorozu-menu]"))
})

test("K6 outside pointerdown hides; item pointerdown does not", async ({ page }) => {
    await openMenu(page)
    await page.locator("#item-stay").click()
    await waitOpacity(page.locator("[data-yorozu-menu]"), "1")
    await page.mouse.click(8, 8)
    await waitGone(page.locator("[data-yorozu-menu]"))
})

test("ArrowDown from the open menu focuses the first enabled item", async ({ page }) => {
    await openMenu(page)
    await page.keyboard.press("ArrowDown")
    await expect(page.locator("#item-stay")).toBeFocused()
})
