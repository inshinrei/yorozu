import { expect, test, type Page } from "@playwright/test"
import { waitGone, waitOpacity } from "../helpers/wait"

const openConfirm = async (page: Page): Promise<{ x: number; y: number }> => {
    await page.goto("/confirm-tooltip.html")
    let trigger = page.locator("#open-confirm")
    let triggerBox = await trigger.boundingBox()
    expect(triggerBox).not.toBeNull()
    let x = triggerBox!.x + triggerBox!.width / 2
    let y = triggerBox!.y + triggerBox!.height / 2
    await trigger.click()
    await waitOpacity(page.locator("[data-yorozu-confirm]"), "1")
    return { x, y }
}

test("C1 panel shows below click, horizontally centered", async ({ page }) => {
    let click = await openConfirm(page)
    let box = await page.locator("[data-yorozu-confirm]").boundingBox()
    expect(box).not.toBeNull()
    expect(Math.abs(box!.y - click.y)).toBeLessThanOrEqual(12)
    expect(Math.abs(box!.x + box!.width / 2 - click.x)).toBeLessThanOrEqual(16)
})

test("C2 danger click hides", async ({ page }) => {
    await openConfirm(page)
    await page.locator("[data-yorozu-confirm-danger]").click()
    await waitGone(page.locator("[data-yorozu-confirm]"))
})

test("C3 Tab to danger + Enter hides", async ({ page }) => {
    await openConfirm(page)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")
    await waitGone(page.locator("[data-yorozu-confirm]"))
})

test("C4 Escape hides", async ({ page }) => {
    await openConfirm(page)
    await page.keyboard.press("Escape")
    await waitGone(page.locator("[data-yorozu-confirm]"))
})

test("C5 outside pointerdown hides; inside does not", async ({ page }) => {
    await openConfirm(page)
    await page.locator("[data-yorozu-confirm-title]").click()
    await waitOpacity(page.locator("[data-yorozu-confirm]"), "1")
    await page.mouse.click(8, 8)
    await waitGone(page.locator("[data-yorozu-confirm]"))
})
