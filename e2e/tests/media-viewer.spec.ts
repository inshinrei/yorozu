import { expect, test, type Page } from "@playwright/test"
import { mouseDrag } from "../helpers/pointer"
import { waitGone } from "../helpers/wait"

const viewer = (page: Page) => page.locator("[data-yorozu-media-viewer]")
const openViewer = (page: Page) => page.locator('[data-yorozu-media-viewer][data-phase="open"]')
const activeStage = (page: Page) => page.locator("[data-side=active] [data-yorozu-media-stage]")
const activeZoom = (page: Page) => page.locator("[data-side=active] [data-yorozu-media-zoom]")
const currentThumb = (page: Page) => page.locator("[data-yorozu-media-thumb][data-current]")

const waitOpen = async (page: Page): Promise<void> => {
    await expect(openViewer(page)).toHaveCount(1)
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

const swipeViewport = async (page: Page, dx: number, dy: number): Promise<void> => {
    let from = await viewportCenter(page)
    await mouseDrag(page, from, { x: from.x + dx, y: from.y + dy })
}

const thumbCenterDelta = async (page: Page): Promise<number | null> => {
    let clip = await page.locator("[data-yorozu-media-filmstrip-clip]").boundingBox()
    let thumb = await currentThumb(page).boundingBox()
    if (clip == null || thumb == null) return null
    let clipCenter = clip.x + clip.width / 2
    let thumbCenter = thumb.x + thumb.width / 2
    return thumbCenter - clipCenter
}

test("V1 open from a thumb shows dialog phase open and active stage", async ({ page }) => {
    await openFromThumb(page, "img-0")
    await expect(viewer(page)).toHaveAttribute("role", "dialog")
    await expect(openViewer(page)).toHaveCount(1)
    await expect(activeStage(page)).toBeVisible()
})

test("V2 image stage is img or canvas and zoom wrap exists", async ({ page }) => {
    await openFromThumb(page, "img-0")
    let tag = await activeStage(page).evaluate((el) => el.tagName)
    expect(["IMG", "CANVAS"]).toContain(tag)
    await expect(activeZoom(page)).toHaveCount(1)
})

test("V3 video stage is video[controls] without zoom wrap", async ({ page }) => {
    await openFromThumb(page, "vid-0")
    let stage = page.locator("[data-side=active] video[data-yorozu-media-stage][controls]")
    await expect(stage).toHaveCount(1)
    let tag = await stage.evaluate((el) => el.tagName)
    expect(tag).toBe("VIDEO")
    await expect(stage).toHaveAttribute("src", /clip\.mp4/)
    await expect(activeZoom(page)).toHaveCount(0)
})

test("V4 gif stage is img without zoom wrap; chrome zoom is a no-op", async ({ page }) => {
    await openFromThumb(page, "gif-0")
    let tag = await activeStage(page).evaluate((el) => el.tagName)
    expect(tag).toBe("IMG")
    await expect(activeZoom(page)).toHaveCount(0)
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
    await page.locator("#chrome-zoom-in").click()
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
    await page.locator("#chrome-zoom-out").click()
    await page.locator("#chrome-zoom-reset").click()
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
})

test("V5 chrome close and Escape both close", async ({ page }) => {
    await openFromThumb(page, "img-0")
    await page.locator("#chrome-close").click()
    await waitGone(viewer(page))
    await page.locator('[data-id="img-0"]').click()
    await waitOpen(page)
    await page.keyboard.press("Escape")
    await waitGone(viewer(page))
})

test("V6 chrome prev/next change index and do not wrap at ends", async ({ page }) => {
    await openFromThumb(page, "img-0")
    await expectIndex(page, 0)
    await page.locator("#chrome-prev").click()
    await expectIndex(page, 0)
    await page.locator("#chrome-next").click()
    await expectIndex(page, 1)
    await page.locator('[data-yorozu-media-thumb][data-index="7"]').click()
    await expectIndex(page, 7)
    await page.locator("#chrome-next").click()
    await expectIndex(page, 7)
    await page.locator("#chrome-prev").click()
    await expectIndex(page, 6)
})

test("V7 chrome zoom and +/=/- /0 keys work on image; no-op on gif/video", async ({ page }) => {
    await openFromThumb(page, "img-0")
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
    await page.locator("#chrome-zoom-in").click()
    await expect(page.locator("#chrome-percent")).toHaveText("125%")
    await page.locator("#chrome-zoom-out").click()
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
    await page.locator("#chrome-zoom-in").click()
    await expect(page.locator("#chrome-percent")).toHaveText("125%")
    await page.locator("#chrome-zoom-reset").click()
    await expect(page.locator("#chrome-percent")).toHaveText("100%")

    await page.locator("[data-yorozu-media-viewer]").focus()
    await page.keyboard.press("+")
    await expect(page.locator("#chrome-percent")).toHaveText("125%")
    await page.keyboard.press("0")
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
    await page.keyboard.press("=")
    await expect(page.locator("#chrome-percent")).toHaveText("125%")
    await page.keyboard.press("-")
    await expect(page.locator("#chrome-percent")).toHaveText("100%")

    await page.locator("#chrome-close").click()
    await waitGone(viewer(page))
    await page.locator('[data-id="gif-0"]').click()
    await waitOpen(page)
    await page.locator("#chrome-zoom-in").click()
    await page.keyboard.press("+")
    await expect(page.locator("#chrome-percent")).toHaveText("100%")

    await page.locator("#chrome-close").click()
    await waitGone(viewer(page))
    await page.locator('[data-id="vid-0"]').click()
    await waitOpen(page)
    await page.locator("#chrome-zoom-in").click()
    await page.keyboard.press("+")
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
})

test("V8 exactly one current filmstrip thumb; data-index matches session index", async ({ page }) => {
    await openFromThumb(page, "img-2")
    await expect(page.locator("[data-yorozu-media-thumb][data-current]")).toHaveCount(1)
    await expect(page.locator("[data-yorozu-media-thumb][data-current][aria-current=true]")).toHaveCount(1)
    await expectIndex(page, 2)
    await page.locator("#chrome-next").click()
    await expect(page.locator("[data-yorozu-media-thumb][data-current]")).toHaveCount(1)
    await expect(page.locator("[data-yorozu-media-thumb][data-current][aria-current=true]")).toHaveCount(1)
    await expectIndex(page, 3)
})

test("V9 current thumb stays centered in the filmstrip clip", async ({ page }) => {
    await openFromThumb(page, "img-3")
    await expect.poll(async () => Math.abs((await thumbCenterDelta(page)) ?? 999)).toBeLessThanOrEqual(40)

    await page.locator('[data-yorozu-media-thumb][data-index="0"]').click()
    await expectIndex(page, 0)
    await expect
        .poll(async () => {
            let delta = await thumbCenterDelta(page)
            return delta != null && delta <= 2
        })
        .toBe(true)

    await page.locator('[data-yorozu-media-thumb][data-index="7"]').click()
    await expectIndex(page, 7)
    await expect
        .poll(async () => {
            let delta = await thumbCenterDelta(page)
            return delta != null && delta >= -2
        })
        .toBe(true)
})

test("V10 horizontal swipe >50px on the viewport changes item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await swipeViewport(page, -80, 0)
    await expectIndex(page, 2)
    await swipeViewport(page, 80, 0)
    await expectIndex(page, 1)
})

test("V11 vertical swipe >50px dismisses", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await swipeViewport(page, 0, 80)
    await waitGone(viewer(page))
})

test("V12 ArrowLeft / ArrowRight switch when overlay focused", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await page.locator("[data-yorozu-media-viewer]").focus()
    await page.keyboard.press("ArrowRight")
    await expectIndex(page, 2)
    await page.keyboard.press("ArrowLeft")
    await expectIndex(page, 1)
})

test("V13 click a non-current filmstrip thumb jumps; current thumb is disabled", async ({ page }) => {
    await openFromThumb(page, "img-0")
    await expect(currentThumb(page)).toBeDisabled()
    await page.locator('[data-yorozu-media-thumb][data-index="5"]').click()
    await expectIndex(page, 5)
    await expect(currentThumb(page)).toBeDisabled()
    await expect(currentThumb(page)).toHaveAttribute("aria-current", "true")
})

test("ArrowRight is locked while zoomed; 0 restores then arrow works", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await page.locator("#chrome-zoom-in").click()
    await expect(page.locator("#chrome-percent")).toHaveText("125%")
    await page.locator("[data-yorozu-media-viewer]").focus()
    await page.keyboard.press("ArrowRight")
    await expectIndex(page, 1)
    await page.keyboard.press("0")
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
    await page.keyboard.press("ArrowRight")
    await expectIndex(page, 2)
})
