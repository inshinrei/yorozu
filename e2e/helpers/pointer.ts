import type { Page } from "@playwright/test"

export async function mouseDrag(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps: number = 12,
): Promise<void> {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps })
    await page.mouse.up()
}
