import { describe, expect, it } from "vitest"
import {
    resolveViewSlideMode,
    slideDirectionByIndex,
    viewSlideDurationMs,
    viewSlideEasing,
    viewSlideTransforms,
} from "./transforms"

describe("slideDirectionByIndex", () => {
    let tabs = [{ id: 1 }, { id: 2 }, { id: 3 }]

    it("returns forward when to index is higher", () => {
        expect(slideDirectionByIndex(1, 3, tabs)).toBe("forward")
    })

    it("returns back when to index is lower", () => {
        expect(slideDirectionByIndex(3, 1, tabs)).toBe("back")
    })

    it("returns null for the same id", () => {
        expect(slideDirectionByIndex(1, 1, tabs)).toBeNull()
    })

    it("returns null for a missing id", () => {
        expect(slideDirectionByIndex(1, 99, tabs)).toBeNull()
        expect(slideDirectionByIndex(99, 3, tabs)).toBeNull()
    })
})

describe("viewSlideTransforms", () => {
    it("push forward fromEnd.transform is translate3d(-100%, 0, 0)", () => {
        let t = viewSlideTransforms("forward", "push")
        expect(t.fromEnd.transform).toBe("translate3d(-100%, 0, 0)")
        expect(t.fromEnd.opacity).toBe("1")
        expect(t.toStart.transform).toBe("translate3d(100%, 0, 0)")
        expect(t.toStart.opacity).toBe("1")
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
    })

    it("push back mirrors the full-width slide", () => {
        let t = viewSlideTransforms("back", "push")
        expect(t.fromEnd.transform).toBe("translate3d(100%, 0, 0)")
        expect(t.toStart.transform).toBe("translate3d(-100%, 0, 0)")
        expect(t.fromEnd.opacity).toBe("1")
        expect(t.toStart.opacity).toBe("1")
    })

    it("crossfade sets leaving opacity to 0", () => {
        let t = viewSlideTransforms("forward", "crossfade")
        expect(t.fromEnd.opacity).toBe("0")
        expect(t.fromEnd.transform).toBe("translate3d(-1.5rem, 0, 0)")
        expect(t.toStart.opacity).toBe("0")
        expect(t.toStart.transform).toBe("translate3d(1.5rem, 0, 0)")
        expect(t.toEnd.opacity).toBe("1")

        let back = viewSlideTransforms("back", "crossfade")
        expect(back.fromEnd.opacity).toBe("0")
        expect(back.fromEnd.transform).toBe("translate3d(1.5rem, 0, 0)")
        expect(back.toStart.transform).toBe("translate3d(-1.5rem, 0, 0)")
    })

    it("cover forward scales the leaving panel and slides the entering one from 200%", () => {
        let t = viewSlideTransforms("forward", "cover")
        expect(t.fromStart).toEqual({ transform: "scale(1)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "scale(0.7)", opacity: "0" })
        expect(t.toStart).toEqual({ transform: "translateX(200%)", opacity: "1" })
        expect(t.toEnd).toEqual({ transform: "translateX(0)", opacity: "1" })
    })

    it("cover back reverses scale-out and the 200% slide", () => {
        let t = viewSlideTransforms("back", "cover")
        expect(t.fromStart).toEqual({ transform: "translateX(0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translateX(200%)", opacity: "1" })
        expect(t.toStart).toEqual({ transform: "scale(0.7)", opacity: "0" })
        expect(t.toEnd).toEqual({ transform: "scale(1)", opacity: "1" })
    })
})

describe("resolveViewSlideMode", () => {
    it("maps stack intensity to none / crossfade / push", () => {
        expect(resolveViewSlideMode("low", "stack")).toBe("none")
        expect(resolveViewSlideMode("med", "stack")).toBe("crossfade")
        expect(resolveViewSlideMode("high", "stack")).toBe("push")
    })

    it("maps layer intensity to none / crossfade / cover", () => {
        expect(resolveViewSlideMode("low", "layer")).toBe("none")
        expect(resolveViewSlideMode("med", "layer")).toBe("crossfade")
        expect(resolveViewSlideMode("high", "layer")).toBe("cover")
    })
})

describe("view-slide timing", () => {
    it("cover uses 250ms ease-in-out; other modes keep 300ms ease-out curve", () => {
        expect(viewSlideDurationMs("cover")).toBe(250)
        expect(viewSlideEasing("cover")).toBe("ease-in-out")
        expect(viewSlideDurationMs("push")).toBe(300)
        expect(viewSlideDurationMs("crossfade")).toBe(300)
        expect(viewSlideEasing("push")).toBe("cubic-bezier(0.25, 1, 0.5, 1)")
        expect(viewSlideEasing("crossfade")).toBe("cubic-bezier(0.25, 1, 0.5, 1)")
    })
})
