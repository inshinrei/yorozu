import { describe, expect, it } from "vitest"
import { makeSilentLog } from "./silent"

describe("makeSilentLog", () => {
    it("executes span callbacks with no dispatchers", async () => {
        let log = makeSilentLog()
        let ran = 0
        let value = await log.span("work", async () => {
            ran++
            return 7
        })
        expect(ran).toBe(1)
        expect(value).toBe(7)
    })

    it("rethrows from span", async () => {
        let log = makeSilentLog()
        await expect(
            log.span("boom", async () => {
                throw new Error("x")
            }),
        ).rejects.toThrow("x")
    })
})
