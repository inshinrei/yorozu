import { expect, test } from "@playwright/test"
import {
    activeStage,
    activeZoom,
    currentThumb,
    expectIndex,
    expectIndexNow,
    MEDIA_FILMSTRIP_CURRENT_GAP_PX,
    MEDIA_FILMSTRIP_MOBILE_MAX_PX,
    MEDIA_VIEWER_SETTLE_MS,
    MEDIA_VIEWER_WHEEL_RELEASE_MS,
    openFromThumb,
    openMediaViewer,
    openViewer,
    swipeViewport,
    swipeViewportHold,
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
    await expect.poll(async () => Math.abs((await thumbCenterDelta(page)) ?? 999)).toBeLessThanOrEqual(12)

    let last = page.locator("[data-yorozu-media-thumb]").last()
    let lastIndex = (await page.locator("[data-yorozu-media-thumb]").count()) - 1
    await last.click()
    await expectIndex(page, lastIndex)
    await expect.poll(async () => Math.abs((await thumbCenterDelta(page)) ?? 999)).toBeLessThanOrEqual(12)
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

test("trackpad wheel past 50px waits for idle then changes item", async ({ page }) => {
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

test("trackpad wheel 120px still waits for idle (no early commit)", async ({ page }) => {
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

test("trackpad wheel down past 50px dismisses after idle", async ({ page }) => {
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

test("trackpad bounce can be grabbed again before snap finishes", async ({ page }) => {
    await openFromThumb(page, "img-1", { motion: true })
    await expectIndex(page, 1)
    await page.locator("[data-yorozu-media-viewport]").hover()
    await page.mouse.wheel(20, 0)
    expect(await currentThumb(page).getAttribute("data-index")).toBe("1")
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 16)
    await page.mouse.wheel(40, 0)
    expect(await currentThumb(page).getAttribute("data-index")).toBe("1")
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    await expectIndex(page, 2)
})

test("trackpad bounce re-grab under 50px stays on the item", async ({ page }) => {
    await openFromThumb(page, "img-1", { motion: true })
    await expectIndex(page, 1)
    await page.locator("[data-yorozu-media-viewport]").hover()
    await page.mouse.wheel(20, 0)
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 16)
    await page.mouse.wheel(5, 0)
    expect(await currentThumb(page).getAttribute("data-index")).toBe("1")
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + MEDIA_VIEWER_SETTLE_MS + 50)
    await expectIndex(page, 1)
})

test("trackpad leftover after a committed switch does not skip another item", async ({ page }) => {
    await openFromThumb(page, "img-1")
    await expectIndex(page, 1)
    await page.locator("[data-yorozu-media-viewport]").hover()
    await page.mouse.wheel(80, 0)
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    await expectIndex(page, 2)
    await page.mouse.wheel(80, 0)
    await waitMs(MEDIA_VIEWER_WHEEL_RELEASE_MS + 50)
    expect(await currentThumb(page).getAttribute("data-index")).toBe("2")
})

test("filmstrip current is the same height and fatter than neighbors", async ({ page }) => {
    await openFromThumb(page, "img-wide")
    let current = currentThumb(page)
    let index = Number(await current.getAttribute("data-index"))
    let neighbor = page.locator(`[data-yorozu-media-thumb][data-index="${index - 1}"]`)
    let c = await current.boundingBox()
    let n = await neighbor.boundingBox()
    expect(c).not.toBeNull()
    expect(n).not.toBeNull()
    expect(Math.abs(c!.height - n!.height)).toBeLessThanOrEqual(1)
    expect(c!.width).toBeGreaterThan(n!.width + 1)
    expect(c!.x - (n!.x + n!.width)).toBeGreaterThanOrEqual(MEDIA_FILMSTRIP_CURRENT_GAP_PX - 1)
})

test("landscape current is wider than portrait current", async ({ page }) => {
    await openFromThumb(page, "img-wide")
    let wide = (await currentThumb(page).boundingBox())!.width
    await page.locator('[data-yorozu-media-thumb][data-id="img-tall"]').click()
    await expect(currentThumb(page)).toHaveAttribute("data-id", "img-tall")
    let tall = (await currentThumb(page).boundingBox())!.width
    expect(wide).toBeGreaterThan(tall + 1)
})

test("short filmstrip fades first and last thumbs and does not overflow", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { strip: "short" })
    let nav = page.locator("[data-yorozu-media-filmstrip]")
    await expect(nav).toHaveAttribute("data-overflow", "false")
    let clip = page.locator("[data-yorozu-media-filmstrip-clip]")
    await expect(clip).toHaveAttribute("data-overflow", "false")
    await expect(page.locator("[data-yorozu-media-thumb]").first()).toHaveAttribute("data-edge", "start")
    await expect(page.locator("[data-yorozu-media-thumb]").last()).toHaveAttribute("data-edge", "end")
    let box = await nav.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
    expect(box.sw).toBeLessThanOrEqual(box.cw)
    let mask = await clip.evaluate((el) => {
        let cs = getComputedStyle(el)
        return cs.maskImage || cs.webkitMaskImage
    })
    expect(mask === "none" || mask === "").toBe(true)
})

test("long filmstrip overflows with clip-edge fade", async ({ page }) => {
    await openFromThumb(page, "img-0")
    let nav = page.locator("[data-yorozu-media-filmstrip]")
    let clip = page.locator("[data-yorozu-media-filmstrip-clip]")
    await expect(nav).toHaveAttribute("data-overflow", "true")
    await expect(clip).toHaveAttribute("data-overflow", "true")
    await expect(clip).toHaveAttribute("data-fade-start", "false")
    await expect(clip).toHaveAttribute("data-fade-end", "true")
    await expect(page.locator("[data-yorozu-media-thumb][data-edge]")).toHaveCount(0)
    let mask = await clip.evaluate((el) => {
        let cs = getComputedStyle(el)
        return cs.maskImage || cs.webkitMaskImage
    })
    expect(mask).not.toBe("none")
    expect(mask.toLowerCase()).toContain("linear-gradient")

    await page.locator('[data-yorozu-media-thumb][data-index="10"]').click()
    await expectIndex(page, 10)
    await expect(clip).toHaveAttribute("data-fade-start", "true")
    await expect(clip).toHaveAttribute("data-fade-end", "true")
})

test("stage click fades chrome and a second click shows it", async ({ page }) => {
    await openFromThumb(page, "img-0")
    await activeStage(page).click()
    await expect(viewer(page)).toHaveAttribute("data-chrome", "hidden")
    let headerOpacity = await page.locator("[data-yorozu-media-header]").evaluate((el) => getComputedStyle(el).opacity)
    let clipOpacity = await page
        .locator("[data-yorozu-media-filmstrip-clip]")
        .evaluate((el) => getComputedStyle(el).opacity)
    expect(Number(headerOpacity)).toBe(0)
    expect(Number(clipOpacity)).toBe(0)
    await activeStage(page).click()
    await expect(viewer(page)).not.toHaveAttribute("data-chrome", "hidden")
    headerOpacity = await page.locator("[data-yorozu-media-header]").evaluate((el) => getComputedStyle(el).opacity)
    expect(Number(headerOpacity)).toBe(1)
    await page.locator("#chrome-close").click()
    await waitGone(viewer(page))
})

test("640px overlay uses a full-width strip and zero stage pad-x", async ({ page }) => {
    await openMediaViewer(page, "img-0", {
        viewport: { width: MEDIA_FILMSTRIP_MOBILE_MAX_PX, height: 800 },
    })
    let overlay = viewer(page)
    let clip = page.locator("[data-yorozu-media-filmstrip-clip]")
    let pane = page.locator("[data-side=active]")
    let o = await overlay.boundingBox()
    let c = await clip.boundingBox()
    expect(o).not.toBeNull()
    expect(c).not.toBeNull()
    expect(Math.abs(c!.width - o!.width)).toBeLessThanOrEqual(2)
    let pad = await pane.evaluate((el) => {
        let cs = getComputedStyle(el)
        let host = el.closest("[data-yorozu-media-viewer]")
        let ocs = host ? getComputedStyle(host) : cs
        let rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
        let tokenPx = (name: string, fallbackRem: number): number => {
            let v = ocs.getPropertyValue(name).trim()
            if (v.endsWith("px")) return Number.parseFloat(v)
            if (v.endsWith("rem")) return Number.parseFloat(v) * rootPx
            return fallbackRem * rootPx
        }
        return {
            padX: cs.paddingLeft,
            paddingBottom: Number.parseFloat(cs.paddingBottom),
            expected:
                tokenPx("--yorozu-media-filmstrip-thumb-h", 4) + tokenPx("--yorozu-media-filmstrip-stage-gap", 0.75),
        }
    })
    expect(pad.padX).toBe("0px")
    expect(Math.abs(pad.paddingBottom - pad.expected)).toBeLessThanOrEqual(1)
})

test("1280px overlay keeps a compact strip", async ({ page }) => {
    await openMediaViewer(page, "img-0", { viewport: { width: 1280, height: 800 } })
    let overlay = viewer(page)
    let clip = page.locator("[data-yorozu-media-filmstrip-clip]")
    let o = await overlay.boundingBox()
    let c = await clip.boundingBox()
    expect(o).not.toBeNull()
    expect(c).not.toBeNull()
    expect(c!.width).toBeLessThan(o!.width * 0.5)
    expect(Math.abs(c!.width - o!.width * 0.36)).toBeLessThanOrEqual(2)
})

test("current width animates on next when motion is on", async ({ page }) => {
    await openMediaViewer(page, "img-tall", { motion: true })
    let start = (await currentThumb(page).boundingBox())!.width
    await page.locator('[data-yorozu-media-thumb][data-id="img-wide"]').click()
    await page.waitForTimeout(80)
    let mid = (await currentThumb(page).boundingBox())!.width
    await expect(currentThumb(page)).toHaveAttribute("data-id", "img-wide")
    await page.waitForTimeout(400)
    let end = (await currentThumb(page).boundingBox())!.width
    expect(mid).not.toBe(end)
    expect(start).not.toBe(end)
})

test("album swipe morphs filmstrip current and next before index changes", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { motion: true })
    let startIndex = await currentThumb(page).getAttribute("data-index")
    let rest = (await currentThumb(page).boundingBox())!.width
    await swipeViewportHold(page, -80, 0)
    await expect(currentThumb(page)).toHaveAttribute("data-index", String(startIndex))
    let live = (await currentThumb(page).boundingBox())!.width
    expect(live).toBeLessThan(rest)
    await page.mouse.up()
})

test("album swipe fattens incoming filmstrip thumb before index changes", async ({ page }) => {
    await openMediaViewer(page, "img-tall", { motion: true })
    let startIndex = await currentThumb(page).getAttribute("data-index")
    let incoming = page.locator(`[data-yorozu-media-thumb][data-index="${Number(startIndex) - 1}"]`)
    let incomingRest = (await incoming.boundingBox())!.width
    await swipeViewportHold(page, 80, 0)
    await expect(currentThumb(page)).toHaveAttribute("data-index", String(startIndex))
    let incomingLive = (await incoming.boundingBox())!.width
    expect(incomingLive).toBeGreaterThan(incomingRest)
    await page.mouse.up()
})

test("album swipe under 50px restores filmstrip rest widths", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { motion: true })
    let rest = (await currentThumb(page).boundingBox())!.width
    await swipeViewportHold(page, -20, 0)
    await page.mouse.up()
    await page.waitForTimeout(400)
    let end = (await currentThumb(page).boundingBox())!.width
    expect(Math.abs(end - rest)).toBeLessThanOrEqual(1)
})

test("album swipe stamps data-pager-field and shows both panes before index changes", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { motion: true })
    let startIndex = await currentThumb(page).getAttribute("data-index")
    await swipeViewportHold(page, -80, 0)
    await expect(page.locator("[data-yorozu-media-viewport]")).toHaveAttribute("data-pager-field", "")
    await expect(page.locator("[data-yorozu-media-pane][data-side=active]")).toHaveCount(1)
    await expect(page.locator("[data-yorozu-media-pane][data-side=newer]")).toHaveCount(1)
    expect(await currentThumb(page).getAttribute("data-index")).toBe(String(startIndex))
    await page.mouse.up()
})

test("album swipe under 50px clears data-pager-field after settle", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { motion: true })
    await swipeViewportHold(page, -20, 0)
    await expect(page.locator("[data-yorozu-media-viewport]")).toHaveAttribute("data-pager-field", "")
    await page.mouse.up()
    await waitMs(MEDIA_VIEWER_SETTLE_MS + 50)
    await expect(page.locator("[data-yorozu-media-viewport]")).not.toHaveAttribute("data-pager-field")
})

test("album swipe pans the active bitmap on desktop before index changes", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { motion: true, viewport: { width: 1280, height: 800 } })
    let startIndex = await currentThumb(page).getAttribute("data-index")
    await swipeViewportHold(page, -80, 0)
    await expect(page.locator("[data-yorozu-media-viewport]")).toHaveAttribute("data-pager-field", "")
    expect(await currentThumb(page).getAttribute("data-index")).toBe(String(startIndex))
    let transform = await activeStage(page).evaluate((el) => (el as HTMLElement).style.transform)
    expect(transform).toContain("translate3d(")
    expect(transform).toContain("scale(")
    let x = Number(/translate3d\(([-\d.]+)px/.exec(transform)?.[1] ?? "NaN")
    let scale = Number(/scale\(([-\d.]+)\)/.exec(transform)?.[1] ?? "NaN")
    expect(x).toBeGreaterThan(0)
    let clipW = await page
        .locator("[data-side=active] [data-yorozu-media-clip]")
        .evaluate((el) => (el as HTMLElement).clientWidth)
    expect(clipW).toBeGreaterThan(0)
    expect(scale).toBeGreaterThan(1)
    await page.mouse.up()
    await waitMs(MEDIA_VIEWER_SETTLE_MS + 50)
    await expect(page.locator("[data-yorozu-media-viewport]")).not.toHaveAttribute("data-pager-field")
    expect(await activeStage(page).evaluate((el) => (el as HTMLElement).style.transform)).toBe("")
})

test("album swipe zeros clip radius under 40rem", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { motion: true, viewport: { width: 640, height: 800 } })
    await swipeViewportHold(page, -80, 0)
    await expect(page.locator("[data-yorozu-media-viewport]")).toHaveAttribute("data-pager-field", "")
    let radius = await page
        .locator("[data-side=active] [data-yorozu-media-clip]")
        .evaluate((el) => getComputedStyle(el).borderRadius)
    expect(radius).toBe("0px")
    await page.mouse.up()
})

test("keyboard switch does not pan the active bitmap", async ({ page }) => {
    await openMediaViewer(page, "img-wide", { motion: true })
    await page.keyboard.press("ArrowRight")
    await expect(page.locator("[data-yorozu-media-strip]")).toHaveAttribute("data-switch", "newer")
    await expect(page.locator("[data-yorozu-media-viewport]")).not.toHaveAttribute("data-pager-field")
    expect(await activeStage(page).evaluate((el) => (el as HTMLElement).style.transform)).toBe("")
})
