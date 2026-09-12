import { describe, expect, it } from "vitest"
import * as vl from "./index"

describe("package barrel", () => {
    it("exports slice controller and helpers", () => {
        expect(typeof vl.getViewportSlice).toBe("function")
        expect(typeof vl.areIdArraysEqual).toBe("function")
        expect(typeof vl.reuseIfEqual).toBe("function")
        expect(typeof vl.ViewportIdSliceController).toBe("function")
        expect(vl.DEFAULT_LIST_SLICE).toBe(30)
        expect(vl.DEFAULT_MAX_MOUNTED_FACTOR).toBe(3)
        expect(typeof vl.createEdgeDebouncedLoaders).toBe("function")
        expect(typeof vl.handleEdgeScroll).toBe("function")
        expect(typeof vl.maybePreloadBackwards).toBe("function")
        expect(typeof vl.leadingDebounce).toBe("function")
        expect(vl.DEFAULT_SENSITIVE_AREA_PX).toBe(800)
        expect(vl.DEFAULT_EDGE_DEBOUNCE_MS).toBe(150)
        expect(vl.DEFAULT_IDLE_TRIM_MS).toBe(150)
    })
})
