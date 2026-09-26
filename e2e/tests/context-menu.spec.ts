import { expect, test, type Page } from "@playwright/test"
import { waitGone, waitMs, waitOpacity } from "../helpers/wait"

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
    await page.locator("#item-sub").dispatchEvent("pointerenter")
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

test("ArrowDown skips disabled items", async ({ page }) => {
    await openMenu(page)
    await page.keyboard.press("ArrowDown")
    await expect(page.locator("#item-stay")).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(page.locator("#item-close")).toBeFocused()
})

test("Escape does not close when listenEsc is false", async ({ page }) => {
    await page.goto("/context-menu.html?esc=0")
    await page.locator("#menu-target").click({ button: "right" })
    await waitOpacity(page.locator("[data-yorozu-menu]").first(), "1")
    await page.keyboard.press("Escape")
    await waitOpacity(page.locator("[data-yorozu-menu]").first(), "1")
})

test("viewport flip near the corner keeps the menu on screen", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await page.goto("/context-menu.html")
    let trigger = page.locator("#menu-target-corner")
    let triggerBox = await trigger.boundingBox()
    expect(triggerBox).not.toBeNull()
    let clickX = triggerBox!.x + triggerBox!.width / 2
    let clickY = triggerBox!.y + triggerBox!.height / 2
    await trigger.click({ button: "right" })
    let menu = page.locator("[data-yorozu-menu]").first()
    await waitOpacity(menu, "1")
    let box = await menu.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(16)
    expect(box!.y).toBeGreaterThanOrEqual(16)
    expect(box!.x + box!.width).toBeLessThanOrEqual(800 - 16)
    expect(box!.y + box!.height).toBeLessThanOrEqual(600 - 16)
    expect(box!.x).toBeLessThan(clickX)
    expect(box!.y).toBeLessThan(clickY)
})
