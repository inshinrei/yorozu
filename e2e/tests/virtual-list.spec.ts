import { expect, test, type Page } from "@playwright/test"
import { waitMs } from "../helpers/wait"
import { assertContiguous, mountedIds, OVERSCROLL_SETTLE_MS, OVERSCROLL_WHEEL_RELEASE_MS } from "../helpers/list"

const ITEM_SIZE: number = 48
const SIZER_HEIGHT: string = "24000px"

const rows = (page: Page) => page.locator("#scroller [data-id]")
const row = (page: Page, id: string) => page.locator(`#scroller [data-id="${id}"]`)

const assertWindow = async (page: Page, opts?: { firstId?: string; includes?: string }): Promise<string[]> => {
    let ids = await mountedIds(rows(page))
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.length).toBeLessThan(80)
    expect(ids.length).toBeGreaterThanOrEqual(16)
    expect(ids.length).toBeLessThanOrEqual(90)
    assertContiguous(ids, "row-")
    if (opts?.firstId !== undefined) {
        expect(ids[0]).toBe(opts.firstId)
    }
    if (opts?.includes !== undefined) {
        expect(ids).toContain(opts.includes)
    }
    return ids
}

const jumpTo = async (page: Page, index: number): Promise<void> => {
    await page.locator("#scroller").evaluate(
        (el: HTMLElement, args: { index: number; itemSize: number }) => {
            el.scrollTop = args.index * args.itemSize
        },
        { index, itemSize: ITEM_SIZE },
    )
    await expect(row(page, `row-${String(index)}`)).toBeAttached()
}

test("L1 cold mount windows from the top", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()
    await expect(page.locator("#sizer")).toHaveCSS("height", SIZER_HEIGHT)
    await assertWindow(page, { firstId: "row-0" })
})

test("L2 jump-80 auto-reanchors past the mounted window", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()
    await expect(page.locator("#sizer")).toHaveCSS("height", SIZER_HEIGHT)

    await page.locator("#jump-80").click()
    await expect(row(page, "row-80")).toBeVisible()
    await assertWindow(page, { includes: "row-80" })
    await expect(page.locator("#sizer")).toHaveCSS("height", SIZER_HEIGHT)
})

test("L3 reanchor-80 includes row-80", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()

    await page.locator("#reanchor-80").click()
    await expect(row(page, "row-80")).toBeAttached()
    await assertWindow(page, { includes: "row-80" })
})

test("after jump-80, wait 200ms, row-80 still mounted", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()
    await page.locator("#jump-80").click()
    await expect(row(page, "row-80")).toBeAttached()
    await waitMs(200)
    await expect(row(page, "row-80")).toBeAttached()
})

test("PageDown Home End on a focused scroller move the window", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()
    let scroller = page.locator("#scroller")
    await scroller.focus()
    await page.keyboard.press("PageDown")
    await expect.poll(async () => scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBeGreaterThan(0)
    let scrollTop = await scroller.evaluate((el) => (el as HTMLElement).scrollTop)
    let afterPage = await mountedIds(rows(page))
    assertContiguous(afterPage, "row-")
    let firstVisible = Math.floor(scrollTop / ITEM_SIZE)
    expect(afterPage).toContain(`row-${String(firstVisible)}`)

    await scroller.focus()
    await page.keyboard.press("End")
    await expect
        .poll(async () =>
            scroller.evaluate((el) => {
                let node = el as HTMLElement
                return node.scrollHeight - node.clientHeight - node.scrollTop
            }),
        )
        .toBeLessThan(2)
    await expect(row(page, "row-490")).toBeAttached()
    let afterEnd = await mountedIds(rows(page))
    assertContiguous(afterEnd, "row-")
    expect(afterEnd).toContain("row-490")

    await scroller.focus()
    await page.keyboard.press("Home")
    await expect(row(page, "row-0")).toBeAttached()
    await assertWindow(page, { firstId: "row-0" })
})

test("L4 rapid jumps keep the target mounted and contiguous", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()

    for (let i of [0, 80, 20, 490, 10]) {
        await jumpTo(page, i)
        let ids = await mountedIds(rows(page))
        expect(ids.length).toBeGreaterThan(0)
        expect(ids.length).toBeLessThan(80)
        expect(ids).toContain(`row-${String(i)}`)
        assertContiguous(ids, "row-")
    }
})

test("wheel at top rubber-bands then settles", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()
    let scroller = page.locator("#scroller")
    let sizer = page.locator("#sizer")
    await expect.poll(async () => scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBe(0)
    await scroller.hover()
    await page.mouse.wheel(0, -80)
    expect(await sizer.getAttribute("data-yorozu-overscroll")).toBe("top")
    expect(await scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBe(0)
    expect(await row(page, "row-0").evaluate((el) => (el as HTMLElement).style.top)).toBe("0px")
    await waitMs(OVERSCROLL_WHEEL_RELEASE_MS + OVERSCROLL_SETTLE_MS + 50)
    expect(await sizer.getAttribute("data-yorozu-overscroll")).toBe("none")
    await expect(sizer).toHaveCSS("transform", "none")
})

test("wheel at bottom rubber-bands then settles", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()
    let scroller = page.locator("#scroller")
    let sizer = page.locator("#sizer")
    await scroller.focus()
    await page.keyboard.press("End")
    await expect(row(page, "row-490")).toBeAttached()
    let max = await scroller.evaluate((el) => {
        let node = el as HTMLElement
        return node.scrollHeight - node.clientHeight
    })
    await expect.poll(async () => scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBe(max)
    await scroller.hover()
    await page.mouse.wheel(0, 80)
    expect(await sizer.getAttribute("data-yorozu-overscroll")).toBe("bottom")
    expect(await scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBe(max)
    await waitMs(OVERSCROLL_WHEEL_RELEASE_MS + OVERSCROLL_SETTLE_MS + 50)
    expect(await sizer.getAttribute("data-yorozu-overscroll")).toBe("none")
})

test("PageDown does not rubber-band", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()
    let scroller = page.locator("#scroller")
    let sizer = page.locator("#sizer")
    await scroller.focus()
    await page.keyboard.press("PageDown")
    expect(await sizer.getAttribute("data-yorozu-overscroll")).toBe("none")
    await expect.poll(async () => scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBeGreaterThan(0)
})

test("scrollToIndex-80 mounts row-80", async ({ page }) => {
    await page.goto("/virtual-list.html")
    await expect(row(page, "row-0")).toBeAttached()

    await page.locator("#scroll-to-80").click()
    await expect(row(page, "row-80")).toBeAttached()
    await assertWindow(page, { includes: "row-80" })
    await expect(page.locator("#sizer")).toHaveCSS("height", SIZER_HEIGHT)
})
