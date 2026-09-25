import { expect, test, type Locator, type Page } from "@playwright/test"

type Point = { x: number; y: number }

const boxCenter = (box: { x: number; y: number; width: number; height: number }): Point => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
})

const joinDataKeys = async (list: Locator): Promise<string> => {
    return list
        .locator("[data-key]")
        .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.key ?? "").join(","))
}

const itemTransforms = async (list: Locator): Promise<Array<{ key: string; transform: string }>> => {
    return list.locator("[data-key]").evaluateAll((nodes) =>
        nodes.map((n) => {
            let el = n as HTMLElement
            return { key: el.dataset.key ?? "", transform: el.style.transform }
        }),
    )
}

const parseTranslate3d = (transform: string): { x: number; y: number } | null => {
    let m = transform.match(/translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/)
    if (m == null) return null
    return { x: Number(m[1]), y: Number(m[2]) }
}

const transformsCleared = (rows: Array<{ transform: string }>): boolean => {
    return rows.every((row) => {
        if (row.transform === "" || row.transform === "none") return true
        if (/scale\(1\.05\)/.test(row.transform)) return false
        let t = parseTranslate3d(row.transform)
        if (t == null) return !/translate/.test(row.transform)
        return t.x === 0 && t.y === 0
    })
}

const captureCenters = async (list: Locator): Promise<{ from: Point; to: Point }> => {
    let a = list.locator('[data-key="a"]')
    let c = list.locator('[data-key="c"]')
    await expect(a).toHaveCount(1)
    await expect(c).toHaveCount(1)
    let aBox = await a.boundingBox()
    let cBox = await c.boundingBox()
    expect(aBox).not.toBeNull()
    expect(cBox).not.toBeNull()
    return { from: boxCenter(aBox!), to: boxCenter(cBox!) }
}

const dragTowardWithoutUp = async (page: Page, from: Point, to: Point, first: Point): Promise<void> => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(first.x, first.y)
    await page.mouse.move(to.x, to.y, { steps: 12 })
}

const assertPreview = async (list: Locator, axis: "x" | "y" | "both"): Promise<void> => {
    expect(await joinDataKeys(list)).toBe("a,b,c,d")
    let rows = await itemTransforms(list)
    let dragged = rows.find((row) => row.key === "a")
    expect(dragged).toBeDefined()
    expect(dragged!.transform).toMatch(/scale\(1\.05\)/)
    let siblingShifted = rows.some((row) => {
        if (row.key === "a") return false
        let t = parseTranslate3d(row.transform)
        if (t == null) return false
        if (axis === "y") return t.y !== 0
        if (axis === "x") return t.x !== 0
        return t.x !== 0 || t.y !== 0
    })
    expect(siblingShifted).toBe(true)
}

test("S1 vertical drag a past c previews Y transforms then commits", async ({ page }) => {
    await page.goto("/sortable.html")
    let list = page.locator("#list-y")
    let { from, to } = await captureCenters(list)
    expect(to.y - from.y).toBeGreaterThanOrEqual(10)

    await dragTowardWithoutUp(page, from, to, { x: from.x, y: from.y + 12 })
    await assertPreview(list, "y")

    await page.mouse.up()
    await expect(page.locator("#order-y")).not.toHaveText("a,b,c,d")
    expect(await joinDataKeys(list)).not.toBe("a,b,c,d")
    expect(transformsCleared(await itemTransforms(list))).toBe(true)
})

test("S2 horizontal drag a past c previews X transforms then commits", async ({ page }) => {
    await page.goto("/sortable.html")
    let list = page.locator("#list-x")
    let { from, to } = await captureCenters(list)
    expect(to.x - from.x).toBeGreaterThanOrEqual(10)

    await dragTowardWithoutUp(page, from, to, { x: from.x + 12, y: from.y })
    await assertPreview(list, "x")

    await page.mouse.up()
    await expect(page.locator("#order-x")).not.toHaveText("a,b,c,d")
    expect(await joinDataKeys(list)).not.toBe("a,b,c,d")
    expect(transformsCleared(await itemTransforms(list))).toBe(true)
})

test("S3 both-axis wrap drag into the second row previews then commits", async ({ page }) => {
    await page.goto("/sortable.html")
    let list = page.locator("#list-both")
    let { from, to } = await captureCenters(list)
    expect(to.y).toBeGreaterThan(from.y)
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThanOrEqual(10)

    await dragTowardWithoutUp(page, from, to, { x: from.x, y: from.y + 12 })
    await assertPreview(list, "both")

    await page.mouse.up()
    await expect(page.locator("#order-both")).not.toHaveText("a,b,c,d")
    expect(await joinDataKeys(list)).not.toBe("a,b,c,d")
    expect(transformsCleared(await itemTransforms(list))).toBe(true)
})
