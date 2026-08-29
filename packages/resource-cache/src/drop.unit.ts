import { describe, expect, it, vi } from "vitest"
import { openMemoryDb } from "@yorozu/db"
import { dropDelete, dropStripBlob } from "./drop"
import { resourceSchema, type ResourceRow } from "./row"

function blobOf(n: number): Blob {
    return new Blob([new Uint8Array(n)])
}

async function filesCol() {
    let db = await openMemoryDb(resourceSchema("t", ["files"]))
    return db.collection<ResourceRow>("files")
}

describe("dropDelete", () => {
    it("removes keys and no-ops an empty plan", async () => {
        let col = await filesCol()
        await col.put({ key: "a", storedAt: 1, bytes: 4, blob: blobOf(4), meta: { n: 1 } })
        await col.put({ key: "b", storedAt: 2, bytes: 2, blob: blobOf(2), meta: {} })
        await dropDelete.apply(col, { keys: ["a"], reason: "ttl" })
        expect(await col.get("a")).toBeNull()
        expect(await col.get("b")).not.toBeNull()

        let del = vi.spyOn(col, "delete")
        let put = vi.spyOn(col, "put")
        await dropDelete.apply(col, { keys: [], reason: "count" })
        expect(del).not.toHaveBeenCalled()
        expect(put).not.toHaveBeenCalled()
        expect(await col.get("b")).not.toBeNull()
    })
})

describe("dropStripBlob", () => {
    it("keeps the row with bytes 0 and no blob; empty plan is a no-op", async () => {
        let col = await filesCol()
        let blob = blobOf(8)
        await col.put({ key: "a", storedAt: 7, bytes: 8, blob, meta: { name: "x" } })
        await col.put({ key: "b", storedAt: 8, bytes: 2, blob: blobOf(2), meta: {} })
        await dropStripBlob().apply(col, { keys: ["a", "missing"], reason: "bytes" })
        let a = await col.get("a")
        expect(a).toMatchObject({ key: "a", storedAt: 7, bytes: 0, meta: { name: "x" } })
        expect(a?.blob).toBeUndefined()
        expect("blob" in (a ?? {})).toBe(false)
        expect((await col.get("b"))?.blob).toBeTruthy()

        let put = vi.spyOn(col, "put")
        let del = vi.spyOn(col, "delete")
        await dropStripBlob().apply(col, { keys: [], reason: "bytes" })
        expect(put).not.toHaveBeenCalled()
        expect(del).not.toHaveBeenCalled()
    })
})
