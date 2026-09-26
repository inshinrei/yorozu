import { describe, expect, it } from "vitest"
import { DRAG_LOCK_PX, DRAG_LOCK_RATIO, projectDragOffset, resolveDragAxis } from "./math"

describe("resolveDragAxis", () => {
    it("locks at 10px / 1.5 ratio", () => {
        expect(DRAG_LOCK_PX).toBe(10)
        expect(DRAG_LOCK_RATIO).toBe(1.5)
        expect(resolveDragAxis("none", 3, 2)).toBe("none")
        expect(resolveDragAxis("none", 20, 2)).toBe("horizontal")
        expect(resolveDragAxis("none", 30, 10)).toBe("horizontal")
        expect(resolveDragAxis("none", 2, 20)).toBe("vertical")
        expect(resolveDragAxis("none", 10, 30)).toBe("vertical")
        expect(resolveDragAxis("horizontal", 0, 100)).toBe("horizontal")
        expect(resolveDragAxis("vertical", 100, 0)).toBe("vertical")
    })
})

describe("projectDragOffset", () => {
    it("zeros the non-active axis", () => {
        expect(projectDragOffset("horizontal", 40, -20)).toEqual({ x: 40, y: 0 })
        expect(projectDragOffset("vertical", 40, -20)).toEqual({ x: 0, y: -20 })
        expect(projectDragOffset("none", 40, -20)).toEqual({ x: 0, y: 0 })
    })
})
