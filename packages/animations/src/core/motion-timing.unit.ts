import { describe, expect, it } from "vitest"
import {
    MOTION_EASE,
    MOTION_EASE_IN,
    MOTION_EASE_OUT,
    MOTION_MODAL_MS,
    MOTION_NAV_MS,
    MOTION_SETTLE_MS,
    MOTION_SPRING_EASE,
    MOTION_UI_MS,
} from "./motion-timing"

describe("motion timing tokens", () => {
    it("locks control, settle, navigation, and modal scales", () => {
        expect(MOTION_UI_MS).toBe(200)
        expect(MOTION_SETTLE_MS).toBe(250)
        expect(MOTION_NAV_MS).toBe(350)
        expect(MOTION_MODAL_MS).toBe(500)
        expect(MOTION_EASE).toBe("cubic-bezier(0.25, 0.1, 0.25, 1)")
        expect(MOTION_EASE_OUT).toBe("ease-out")
        expect(MOTION_EASE_IN).toBe("ease-in")
        expect(MOTION_SPRING_EASE).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)")
    })
})
