import { expect, test, type Page } from "@playwright/test"
import { OVERSCROLL_SETTLE_MS } from "../helpers/list"
import { waitMs } from "../helpers/wait"

test.use({ hasTouch: true })

const touchPan = async (page: Page, dy: number): Promise<void> => {
    let box = await page.locator("#scroller").boundingBox()
    if (box === null) throw new Error("missing #scroller box")
    let from = { x: box.x + box.width / 2, y: box.y + 40 }
    let to = { x: from.x, y: from.y + dy }
    await page.locator("#scroller").evaluate(
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
            fire("pointerup", pts.to.x, pts.to.y, 0)
        },
        { from, to },
    )
}

test("touch pan at top rubber-bands then settles", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(page.locator('#scroller [data-id="row-0"]')).toBeAttached()
    let sizer = page.locator("#sizer")
    await touchPan(page, 80)
    expect(await sizer.getAttribute("data-yorozu-overscroll")).toBe("top")
    await waitMs(OVERSCROLL_SETTLE_MS + 50)
    expect(await sizer.getAttribute("data-yorozu-overscroll")).toBe("none")
})
