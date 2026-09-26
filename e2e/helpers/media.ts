import { expect, type Page } from "@playwright/test"
import { mouseDrag } from "./pointer"

export const viewer = (page: Page) => page.locator("[data-yorozu-media-viewer]")
export const openViewer = (page: Page) => page.locator('[data-yorozu-media-viewer][data-phase="open"]')
export const activeStage = (page: Page) => page.locator("[data-side=active] [data-yorozu-media-stage]")
export const activeZoom = (page: Page) => page.locator("[data-side=active] [data-yorozu-media-zoom]")
export const currentThumb = (page: Page) => page.locator("[data-yorozu-media-thumb][data-current]")

export async function waitOpen(page: Page): Promise<void> {
    await expect(openViewer(page)).toHaveCount(1)
}

export async function openFromThumb(page: Page, id: string, opts?: { motion?: boolean }): Promise<void> {
    let url = opts?.motion ? "/media-viewer.html?motion=1" : "/media-viewer.html"
    await page.goto(url)
    await page.locator(`[data-id="${id}"]`).click()
    await waitOpen(page)
}

export async function expectIndex(page: Page, index: number): Promise<void> {
    await expect(page.locator("[data-yorozu-media-thumb][data-current]")).toHaveCount(1)
    await expect(currentThumb(page)).toHaveAttribute("data-index", String(index))
}

export async function viewportCenter(page: Page): Promise<{ x: number; y: number }> {
    let box = await page.locator("[data-yorozu-media-viewport]").boundingBox()
    expect(box).not.toBeNull()
    return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

export async function swipeViewport(page: Page, dx: number, dy: number): Promise<void> {
    let from = await viewportCenter(page)
    await mouseDrag(page, from, { x: from.x + dx, y: from.y + dy })
}

export const MEDIA_VIEWER_WHEEL_RELEASE_MS: number = 140
export const MEDIA_VIEWER_SETTLE_MS: number = 250

export async function wheelViewport(page: Page, deltaX: number, deltaY: number): Promise<void> {
    await page.locator("[data-yorozu-media-viewport]").hover()
    await page.mouse.wheel(deltaX, deltaY)
}

export async function expectIndexNow(page: Page, index: number): Promise<void> {
    expect(await currentThumb(page).getAttribute("data-index")).toBe(String(index))
}

export async function thumbCenterDelta(page: Page): Promise<number | null> {
    let clip = await page.locator("[data-yorozu-media-filmstrip-clip]").boundingBox()
    let thumb = await currentThumb(page).boundingBox()
    if (clip == null || thumb == null) return null
    let clipCenter = clip.x + clip.width / 2
    let thumbCenter = thumb.x + thumb.width / 2
    return thumbCenter - clipCenter
}
