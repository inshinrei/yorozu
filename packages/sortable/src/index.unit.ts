import { describe, expect, it } from "vitest"
import * as sortable from "./index"

describe("package barrel", () => {
    it("exports session, geometry, auto-scroll loop, feel, reorder-mode", () => {
        expect(typeof sortable.createSortableSession).toBe("function")
        expect(typeof sortable.findScrollParent).toBe("function")
        expect(typeof sortable.moveItem).toBe("function")
        expect(typeof sortable.computeAutoScrollDelta1d).toBe("function")
        expect(typeof sortable.computeAutoScrollDeltaX).toBe("function")
        expect(typeof sortable.createSortableAutoScroll).toBe("function")
        expect(typeof sortable.createReorderMode).toBe("function")
        expect(typeof sortable.paintSortableTransforms).toBe("function")
        expect(typeof sortable.createSortableBothAxis).toBe("function")
        expect(typeof sortable.computeInsertIndexFlow).toBe("function")
        expect(typeof sortable.paintSortableFlowTransforms).toBe("function")
        expect(sortable.AUTO_SCROLL_ZONE_PX).toBe(60)
        expect(sortable.AUTO_SCROLL_MAX_PX_PER_FRAME).toBe(8)
        expect(sortable.SORTABLE_FEEL.liftScale).toBe(1.05)
        expect(sortable.POINTER_ACTIVATION.delayMs).toBe(0)
        expect(sortable.HOLD_ACTIVATION.delayMs).toBe(200)
    })

    it("does not export pointerOnAxis", () => {
        expect("pointerOnAxis" in sortable).toBe(false)
    })

    it("does not export flow internals", () => {
        expect("readFlowRectSnapshot" in sortable).toBe(false)
        expect("shiftFlowRects" in sortable).toBe(false)
        expect("flowShiftDestIndex" in sortable).toBe(false)
    })
})
