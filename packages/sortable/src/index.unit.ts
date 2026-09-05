import { describe, expect, it } from "vitest"
import * as sortable from "./index"

describe("package barrel", () => {
    it("exports session, geometry, auto-scroll math, feel, reorder-mode", () => {
        expect(typeof sortable.createSortableSession).toBe("function")
        expect(typeof sortable.findScrollParent).toBe("function")
        expect(typeof sortable.moveItem).toBe("function")
        expect(typeof sortable.computeAutoScrollDelta1d).toBe("function")
        expect(typeof sortable.computeAutoScrollDeltaX).toBe("function")
        expect(typeof sortable.createReorderMode).toBe("function")
        expect(sortable.AUTO_SCROLL_ZONE_PX).toBe(60)
        expect(sortable.AUTO_SCROLL_MAX_PX_PER_FRAME).toBe(18)
        expect(sortable.SORTABLE_FEEL.liftScale).toBe(1.05)
        expect(sortable.POINTER_ACTIVATION.delayMs).toBe(0)
        expect(sortable.HOLD_ACTIVATION.delayMs).toBe(200)
    })

    it("does not export the internal auto-scroll loop", () => {
        expect("createSortableAutoScroll" in sortable).toBe(false)
        expect("pointerOnAxis" in sortable).toBe(false)
    })
})
