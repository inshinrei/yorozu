import { describe, expect, it } from "vitest"
import { fitContain, stageContentSize } from "./layout"

describe("media-viewer layout", () => {
    describe("stageContentSize", () => {
        it("stageContentSize subtracts padding and clamps at zero", () => {
            expect(stageContentSize(1000, 800, { top: 12, right: 12, bottom: 12, left: 12 })).toEqual({
                width: 976,
                height: 776,
            })
            expect(stageContentSize(10, 10, { top: 20, right: 0, bottom: 0, left: 0 })).toEqual({
                width: 10,
                height: 0,
            })
        })
    })

    describe("fitContain re-export", () => {
        it("returns null for non-positive inputs", () => {
            expect(fitContain({ width: 0, height: 100 }, { width: 200, height: 200 })).toBeNull()
            expect(fitContain({ width: 100, height: 100 }, { width: 0, height: 200 })).toBeNull()
        })

        it("keeps natural when it already fits (no upscale)", () => {
            expect(fitContain({ width: 200, height: 100 }, { width: 800, height: 600 })).toEqual({
                width: 200,
                height: 100,
            })
        })

        it("scales down to fit width", () => {
            expect(fitContain({ width: 2000, height: 1000 }, { width: 1000, height: 800 })).toEqual({
                width: 1000,
                height: 500,
            })
        })

        it("scales down to fit height", () => {
            expect(fitContain({ width: 1000, height: 2000 }, { width: 800, height: 1000 })).toEqual({
                width: 500,
                height: 1000,
            })
        })
    })
})
