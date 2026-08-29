// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { COMPOSER_MENU_GAP_PX, placeAboveAnchor } from "./place-above"

describe("placeAboveAnchor", () => {
    let viewport = { width: 1000, height: 800 }

    it("start align pins left and bottom above the trigger", () => {
        let out = placeAboveAnchor({ top: 700, left: 40, right: 76 }, "start", viewport)
        expect(COMPOSER_MENU_GAP_PX).toBe(8)
        expect(out.bottom).toBe(800 - 700 + 8)
        expect(out.left).toBe(40)
        expect(out.right).toBeUndefined()
        expect(out.origin).toBe("bottom left")
    })

    it("end align pins right and bottom above the trigger", () => {
        let out = placeAboveAnchor({ top: 700, left: 900, right: 964 }, "end", viewport)
        expect(out.bottom).toBe(108)
        expect(out.right).toBe(1000 - 964)
        expect(out.left).toBeUndefined()
        expect(out.origin).toBe("bottom right")
    })

    it("defaults viewport to window and gap to COMPOSER_MENU_GAP_PX", () => {
        let innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")
        let innerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight")
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 })
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 })
        try {
            let out = placeAboveAnchor({ top: 700, left: 40, right: 76 }, "start")
            expect(out.bottom).toBe(800 - 700 + COMPOSER_MENU_GAP_PX)
            expect(out.left).toBe(40)
            expect(out.origin).toBe("bottom left")
        } finally {
            if (innerWidth) Object.defineProperty(window, "innerWidth", innerWidth)
            if (innerHeight) Object.defineProperty(window, "innerHeight", innerHeight)
        }
    })
})
