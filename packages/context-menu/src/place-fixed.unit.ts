import { describe, expect, it } from "vitest"
import {
    MENU_MAX_HEIGHT_BOTTOM_MARGIN_PX,
    MENU_POINTER_NUDGE_PX,
    MENU_VIEW_MARGIN_PX,
    placeFixedMenu,
} from "./place-fixed"

describe("placeFixedMenu", () => {
    it("grows down-right from the pointer when it fits", () => {
        let out = placeFixedMenu({
            anchorX: 120,
            anchorY: 80,
            menuWidth: 160,
            menuHeight: 100,
            viewportWidth: 2000,
            viewportHeight: 2000,
        })
        expect(out.positionX).toBe("left")
        expect(out.positionY).toBe("top")
        expect(out.left).toBe(120 + MENU_POINTER_NUDGE_PX)
        expect(out.top).toBe(80)
        expect(out.originX).toBe(120 - out.left)
        expect(out.originY).toBe(0)
        expect(out.origin).toBe(`${out.originX}px ${out.originY}px`)
        expect(out.maxHeight).toBeUndefined()
    })

    it("grows up when the box would overflow the bottom", () => {
        let out = placeFixedMenu({
            anchorX: 100,
            anchorY: 250,
            menuWidth: 160,
            menuHeight: 120,
            viewportWidth: 2000,
            viewportHeight: 300,
        })
        expect(out.positionY).toBe("bottom")
        expect(out.top).toBe(250 - 120)
        expect(out.originY).toBe(120)
        expect(out.left).toBe(100 + MENU_POINTER_NUDGE_PX)
    })

    it("grows left when the box would overflow the right", () => {
        let out = placeFixedMenu({
            anchorX: 300,
            anchorY: 100,
            menuWidth: 160,
            menuHeight: 80,
            viewportWidth: 400,
            viewportHeight: 2000,
        })
        expect(out.positionX).toBe("right")
        expect(out.left).toBe(300 - 160)
        expect(out.originX).toBe(160)
        expect(out.top).toBe(100)
    })

    it("grows up-left when both edges overflow", () => {
        let out = placeFixedMenu({
            anchorX: 220,
            anchorY: 220,
            menuWidth: 140,
            menuHeight: 120,
            viewportWidth: 300,
            viewportHeight: 300,
        })
        expect(out.positionX).toBe("right")
        expect(out.positionY).toBe("bottom")
        expect(out.left).toBe(220 - 140)
        expect(out.top).toBe(220 - 120)
        expect(out.originX).toBe(140)
        expect(out.originY).toBe(120)
    })

    it("clamps top so extraTopSpace stays in view", () => {
        let out = placeFixedMenu({
            anchorX: 50,
            anchorY: 40,
            menuWidth: 160,
            menuHeight: 80,
            viewportWidth: 2000,
            viewportHeight: 2000,
            extraTopSpace: 48,
        })
        expect(out.top).toBe(MENU_VIEW_MARGIN_PX + 48)
        expect(out.originY).toBe(40 - out.top)
    })

    it("pins left to the margin when the pointer is off-screen left", () => {
        let out = placeFixedMenu({
            anchorX: -20,
            anchorY: 80,
            menuWidth: 160,
            menuHeight: 80,
            viewportWidth: 2000,
            viewportHeight: 2000,
        })
        expect(out.left).toBe(MENU_VIEW_MARGIN_PX)
        expect(out.top).toBe(80)
    })

    it("uses extraMinWidth for overflow decisions", () => {
        let out = placeFixedMenu({
            anchorX: 250,
            anchorY: 40,
            menuWidth: 100,
            menuHeight: 80,
            extraMinWidth: 200,
            viewportWidth: 300,
            viewportHeight: 2000,
        })
        expect(out.positionX).toBe("right")
        expect(out.left).toBe(50)
    })

    it("returns maxHeight when requested", () => {
        let out = placeFixedMenu({
            anchorX: 20,
            anchorY: 20,
            menuWidth: 160,
            menuHeight: 80,
            viewportWidth: 400,
            viewportHeight: 400,
            withMaxHeight: true,
        })
        expect(out.maxHeight).toBe(400 - MENU_MAX_HEIGHT_BOTTOM_MARGIN_PX)
    })
})
