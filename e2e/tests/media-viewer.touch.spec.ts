import { expect, test, type Page } from "@playwright/test"
import { waitGone } from "../helpers/wait"

test.use({ hasTouch: true })

const viewer = (page: Page) => page.locator("[data-yorozu-media-viewer]")
const currentThumb = (page: Page) => page.locator("[data-yorozu-media-thumb][data-current]")

const waitOpen = async (page: Page): Promise<void> => {
    await expect(page.locator('[data-yorozu-media-viewer][data-phase="open"]')).toHaveCount(1)
}

const openFromThumb = async (page: Page, id: string): Promise<void> => {
    await page.goto("/media-viewer.html")
    await page.locator(`[data-id="${id}"]`).click()
    await waitOpen(page)
}

const expectIndex = async (page: Page, index: number): Promise<void> => {
    await expect(page.locator("[data-yorozu-media-thumb][data-current]")).toHaveCount(1)
    await expect(currentThumb(page)).toHaveAttribute("data-index", String(index))
}

const viewportCenter = async (page: Page): Promise<{ x: number; y: number }> => {
    let box = await page.locator("[data-yorozu-media-viewport]").boundingBox()
    expect(box).not.toBeNull()
    return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

const touchSwipe = async (page: Page, dx: number, dy: number): Promise<void> => {
    let from = await viewportCenter(page)
    let to = { x: from.x + dx, y: from.y + dy }
    await page.locator("[data-yorozu-media-viewport]").evaluate(
        (node, pts) => {
            let el = node as HTMLElement
            let fire = (type: string, x: number, y: number, buttons: number): void => {
                el.dispatchEvent(
                    new PointerEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        pointerId: 1,
                        pointerType: "touch",
                        isPrimary: true,
                        clientX: x,
                        clientY: y,
                        button: 0,
                        buttons,
                    }),
                )
            }
            fire("pointerdown", pts.from.x, pts.from.y, 1)
            fire("pointermove", pts.from.x + (pts.to.x - pts.from.x) / 2, pts.from.y + (pts.to.y - pts.from.y) / 2, 1)
            fire("pointermove", pts.to.x, pts.to.y, 1)
            fire("pointerup", pts.to.x, pts.to.y, 0)
        },
        { from, to },
    )
}

test("V10 touch horizontal swipe >50px on the viewport changes item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await touchSwipe(page, -80, 0)
    await expectIndex(page, 2)
})

test("V11 touch vertical swipe >50px dismisses", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await touchSwipe(page, 0, 80)
    await waitGone(viewer(page))
})
