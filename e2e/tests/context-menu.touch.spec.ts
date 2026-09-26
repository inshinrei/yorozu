import { expect, test, type Page } from "@playwright/test"
import { waitMs, waitOpacity } from "../helpers/wait"

test.use({ hasTouch: true })

const dispatchTouch = async (page: Page, type: "touchstart" | "touchend"): Promise<void> => {
    await page.locator("#menu-target").evaluate((node, eventType) => {
        let rect = node.getBoundingClientRect()
        let clientX = rect.x + rect.width / 2
        let clientY = rect.y + rect.height / 2
        let touch = new Touch({
            identifier: 0,
            target: node,
            clientX,
            clientY,
        })
        let active = eventType === "touchend" ? [] : [touch]
        node.dispatchEvent(
            new TouchEvent(eventType, {
                bubbles: true,
                cancelable: true,
                touches: active,
                targetTouches: active,
                changedTouches: [touch],
            }),
        )
    }, type)
}

test("K4 long-press still touch opens", async ({ page }) => {
    await page.goto("/context-menu.html")
    await dispatchTouch(page, "touchstart")
    await waitMs(220)
    await dispatchTouch(page, "touchend")
    await waitOpacity(page.locator("[data-yorozu-menu]"), "1")
})

test("K4 short tap does not open", async ({ page }) => {
    await page.goto("/context-menu.html")
    await dispatchTouch(page, "touchstart")
    await dispatchTouch(page, "touchend")
    await waitMs(250)
    await expect(page.locator("[data-yorozu-menu]")).toHaveCount(0)
})
