import { describe, expect, it } from "vitest"
import { mutableClock, testOutboxStore } from "./_contract"
import { openMemoryOutbox } from "./memory"

describe("openMemoryOutbox", () => {
    testOutboxStore(async () => {
        let clock = mutableClock()
        return { store: openMemoryOutbox({ clock }), clock }
    })

    it("defaults clock to Date.now", async () => {
        let store = openMemoryOutbox()
        let before = Date.now()
        let id = await store.enqueue({ type: "t", payload: 1 })
        let entry = await store.get(id)
        expect(entry!.createdAt).toBeGreaterThanOrEqual(before)
        expect(entry!.createdAt).toBeLessThanOrEqual(Date.now())
        await store.deleteAll()
    })
})
