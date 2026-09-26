import { expect, test } from "@playwright/test"
import {
    activeStage,
    activeZoom,
    currentThumb,
    expectIndex,
    expectIndexNow,
    MEDIA_VIEWER_WHEEL_RELEASE_MS,
    openFromThumb,
    openViewer,
    swipeViewport,
    thumbCenterDelta,
    viewportCenter,
    viewer,
    waitOpen,
    wheelViewport,
} from "../helpers/media"
import { waitGone, waitMs } from "../helpers/wait"

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
    let thumbs = page.locator("[data-yorozu-media-thumb]")
    let lastIndex = (await thumbs.count()) - 1
    await thumbs.last().click()
    await expectIndex(page, lastIndex)
    await page.locator("#chrome-next").click()
    await expectIndex(page, lastIndex)
    await page.locator("#chrome-prev").click()
    await expectIndex(page, lastIndex - 1)
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
    await openFromThumb(page, "img-10")
    await expect.poll(async () => Math.abs((await thumbCenterDelta(page)) ?? 999)).toBeLessThanOrEqual(12)

    await page.locator('[data-yorozu-media-thumb][data-index="0"]').click()
    await expectIndex(page, 0)
    await expect
        .poll(async () => {
            let delta = await thumbCenterDelta(page)
            return delta != null && delta <= 2
        })
        .toBe(true)

    let last = page.locator("[data-yorozu-media-thumb]").last()
    let lastIndex = (await page.locator("[data-yorozu-media-thumb]").count()) - 1
    await last.click()
    await expectIndex(page, lastIndex)
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

test("horizontal swipe is locked while zoomed", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await page.locator("#chrome-zoom-in").click()
    await expect(page.locator("#chrome-percent")).toHaveText("125%")
    await swipeViewport(page, -80, 0)
    await expectIndex(page, 1)
})

test("keys in chrome input are ignored except Escape", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await page.locator("#chrome-search").click()
    await page.keyboard.press("ArrowRight")
    await expectIndex(page, 1)
    await page.keyboard.press("+")
    await expect(page.locator("#chrome-percent")).toHaveText("100%")
    await page.keyboard.press("Escape")
    await waitGone(viewer(page))
})

test("horizontal swipe under 50px stays on the item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await swipeViewport(page, -20, 0)
    await expectIndex(page, 1)
})

test("horizontal swipe that returns under 50px stays on the item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    let from = await viewportCenter(page)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 80, from.y, { steps: 8 })
    await page.mouse.move(from.x - 20, from.y, { steps: 4 })
    await page.mouse.up()
    await expectIndex(page, 1)
})

test("horizontal swipe that ends past 50px changes item even if last delta reversed", async ({ page }) => {
    await openFromThumb(page, "img-1")
    let from = await viewportCenter(page)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 80, from.y, { steps: 8 })
    await page.mouse.move(from.x - 65, from.y, { steps: 4 })
    await page.mouse.up()
    await expectIndex(page, 2)
})

test("vertical swipe up does not move the strip", async ({ page }) => {
    await openFromThumb(page, "img-1")
    let from = await viewportCenter(page)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y - 80, { steps: 8 })
    await expect(page.locator("[data-yorozu-media-strip]")).toHaveCSS("transform", "none")
    await expect(openViewer(page)).toHaveCount(1)
    await page.mouse.up()
    await expect(openViewer(page)).toHaveCount(1)
    await expect(page.locator("[data-yorozu-media-strip]")).toHaveCSS("transform", "none")
    await expectIndex(page, 1)
})

test("trackpad wheel past 50px waits for quiet then changes item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await wheelViewport(page, 80, 0)
    await expectIndexNow(page, 1)
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    await expectIndex(page, 2)
})

test("trackpad wheel under 50px stays on the item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await wheelViewport(page, 20, 0)
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    await expectIndex(page, 1)
})

test("trackpad wheel 120px still waits for quiet (no early commit)", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await wheelViewport(page, 120, 0)
    await expectIndexNow(page, 1)
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    await expectIndex(page, 2)
})

test("trackpad wheel up does not dismiss", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await wheelViewport(page, 0, 80)
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    await expect(openViewer(page)).toHaveCount(1)
    await expect(page.locator("[data-yorozu-media-strip]")).toHaveCSS("transform", "none")
    await expectIndex(page, 1)
})

test("trackpad wheel down past 50px dismisses after quiet", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await wheelViewport(page, 0, -80)
    await waitGone(viewer(page))
})

test("trackpad pan stream does not change item until the wheel stream ends", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await page.locator("[data-yorozu-media-viewport]").hover()
    await page.mouse.wheel(80, 0)
    expect(await currentThumb(page).getAttribute("data-index")).toBe("1")
    for (let i = 0; i < 10; i++) {
        await waitMs(16)
        await page.mouse.wheel(5, 0)
        expect(await currentThumb(page).getAttribute("data-index")).toBe("1")
    }
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    await expectIndex(page, 2)
})
