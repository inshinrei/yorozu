import { describe, expect, it, vi } from "vitest"
import { createReorderMode } from "./reorder-mode"

describe("createReorderMode", () => {
    it("enter sets isActive true; exit sets false", () => {
        let mode = createReorderMode()
        expect(mode.isActive).toBe(false)
        mode.enter()
        expect(mode.isActive).toBe(true)
        mode.exit()
        expect(mode.isActive).toBe(false)
    })

    it("subscribe fires on enter and exit", () => {
        let mode = createReorderMode()
        let listener = vi.fn()
        let unsub = mode.subscribe(listener)
        mode.enter()
        mode.exit()
        expect(listener).toHaveBeenCalledTimes(2)
        unsub()
        mode.enter()
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it("enter/exit are idempotent", () => {
        let mode = createReorderMode()
        let listener = vi.fn()
        mode.subscribe(listener)
        mode.enter()
        mode.enter()
        mode.exit()
        mode.exit()
        expect(listener).toHaveBeenCalledTimes(2)
    })
})
