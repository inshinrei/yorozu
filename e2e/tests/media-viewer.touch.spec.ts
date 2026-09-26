import { expect, test, type Page } from "@playwright/test"
import { expectIndex, openFromThumb, openViewer, viewportCenter, viewer } from "../helpers/media"
import { waitGone } from "../helpers/wait"

test.use({ hasTouch: true })

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

test("touch vertical swipe up does not dismiss", async ({ page }) => {
    await openFromThumb(page, "img-1")
    let from = await viewportCenter(page)
    let to = { x: from.x, y: from.y - 80 }
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
            fire("pointermove", pts.from.x, pts.from.y + (pts.to.y - pts.from.y) / 2, 1)
            fire("pointermove", pts.to.x, pts.to.y, 1)
        },
        { from, to },
    )
    await expect(page.locator("[data-yorozu-media-strip]")).toHaveCSS("transform", "none")
    await expect(openViewer(page)).toHaveCount(1)
    await page.locator("[data-yorozu-media-viewport]").evaluate((node, pt) => {
        ;(node as HTMLElement).dispatchEvent(
            new PointerEvent("pointerup", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: "touch",
                isPrimary: true,
                clientX: pt.x,
                clientY: pt.y,
                button: 0,
                buttons: 0,
            }),
        )
    }, to)
    await expect(openViewer(page)).toHaveCount(1)
    await expect(page.locator("[data-yorozu-media-strip]")).toHaveCSS("transform", "none")
    await expectIndex(page, 1)
})

test("touch horizontal swipe under 50px stays on the item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await touchSwipe(page, -20, 0)
    await expectIndex(page, 1)
})
