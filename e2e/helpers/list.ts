import { expect, type Locator } from "@playwright/test"

export const OVERSCROLL_WHEEL_RELEASE_MS: number = 140
export const OVERSCROLL_SETTLE_MS: number = 500

export async function mountedIds(rows: Locator): Promise<string[]> {
    return rows.evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).dataset.id).filter((id): id is string => Boolean(id)),
    )
}

export function assertContiguous(ids: string[], prefix: string): void {
    expect(ids.length).toBeGreaterThan(0)
    let nums = ids.map((id) => Number(id.slice(prefix.length)))
    for (let i = 1; i < nums.length; i++) {
        expect(nums[i]).toBe(nums[i - 1]! + 1)
    }
}
