import { describe, expect, it } from "vitest"
import { CONFIRM_TOOLTIP_VIEW_MARGIN_PX, placeConfirmTooltip } from "./place"
import { MENU_VIEW_MARGIN_PX } from "@yorozu/context-menu"

describe("placeConfirmTooltip", () => {
    it("aliases MENU_VIEW_MARGIN_PX", () => {
        expect(CONFIRM_TOOLTIP_VIEW_MARGIN_PX).toBe(MENU_VIEW_MARGIN_PX)
        expect(CONFIRM_TOOLTIP_VIEW_MARGIN_PX).toBe(16)
    })

    it("sits below the pointer, horizontally centered, origin at top-center", () => {
        let out = placeConfirmTooltip({
            anchorX: 400,
            anchorY: 100,
            width: 200,
            height: 80,
            viewportWidth: 2000,
            viewportHeight: 2000,
        })
        expect(out.left).toBe(300)
        expect(out.top).toBe(100)
        expect(out.originX).toBe(100)
        expect(out.originY).toBe(0)
        expect(out.origin).toBe("100px 0px")
    })

    it("clamps into the viewport with the default margin", () => {
        let out = placeConfirmTooltip({
            anchorX: 10,
            anchorY: 480,
            width: 200,
            height: 80,
            viewportWidth: 500,
            viewportHeight: 500,
        })
        expect(out.left).toBe(CONFIRM_TOOLTIP_VIEW_MARGIN_PX)
        expect(out.top).toBe(500 - 80 - CONFIRM_TOOLTIP_VIEW_MARGIN_PX)
        expect(out.originX).toBe(10 - out.left)
        expect(out.originY).toBe(480 - out.top)
        expect(out.origin).toBe(`${out.originX}px ${out.originY}px`)
    })

    it("uses the min bound when the box cannot fit between margins", () => {
        let out = placeConfirmTooltip({
            anchorX: 20,
            anchorY: 20,
            width: 400,
            height: 400,
            viewportWidth: 200,
            viewportHeight: 200,
            margin: 16,
        })
        expect(out.left).toBe(16)
        expect(out.top).toBe(16)
    })
})
