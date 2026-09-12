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
    })
})
