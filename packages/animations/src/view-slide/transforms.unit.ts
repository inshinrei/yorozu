import { describe, expect, it } from "vitest"
import { MOTION_EASE, MOTION_SPRING_EASE } from "../core/motion-timing"
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

    it("cover forward fades the leaving panel and slides the entering one from 200%", () => {
        let t = viewSlideTransforms("forward", "cover")
        let explicit = viewSlideTransforms("forward", "cover", "fade")
        expect(t).toEqual(explicit)
        expect(t.fromStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "0" })
        expect(t.toStart).toEqual({ transform: "translateX(200%)", opacity: "1" })
        expect(t.toEnd).toEqual({ transform: "translateX(0)", opacity: "1" })
        expect(t.fromEnd.transform.includes("scale")).toBe(false)
    })

    it("cover back reverses the 200% slide and fade", () => {
        let t = viewSlideTransforms("back", "cover")
        expect(t.fromStart).toEqual({ transform: "translateX(0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translateX(200%)", opacity: "1" })
        expect(t.toStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "0" })
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
    })

    it("coverMotion scale keeps the snapshot scale-out poses", () => {
        let t = viewSlideTransforms("forward", "cover", "scale")
        expect(t.fromStart).toEqual({ transform: "scale(1)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "scale(0.7)", opacity: "0" })
        expect(t.toStart).toEqual({ transform: "translateX(200%)", opacity: "1" })
        let back = viewSlideTransforms("back", "cover", "scale")
        expect(back.toStart).toEqual({ transform: "scale(0.7)", opacity: "0" })
        expect(back.toEnd).toEqual({ transform: "scale(1)", opacity: "1" })
    })

    it("peek forward leaves at -20% / 0.7 and enters from 100%", () => {
        let t = viewSlideTransforms("forward", "peek")
        expect(t.fromStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translate3d(-20%, 0, 0)", opacity: "0.7" })
        expect(t.toStart).toEqual({ transform: "translate3d(100%, 0, 0)", opacity: "1" })
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
    })

    it("peek back reverses the peek and full-width enter", () => {
        let t = viewSlideTransforms("back", "peek")
        expect(t.fromStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translate3d(100%, 0, 0)", opacity: "1" })
        expect(t.toStart).toEqual({ transform: "translate3d(-20%, 0, 0)", opacity: "0.7" })
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
    })

    it("lift forward uses vertical ±100% translate3d", () => {
        let t = viewSlideTransforms("forward", "lift")
        expect(t.fromStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translate3d(0, -100%, 0)", opacity: "1" })
        expect(t.toStart).toEqual({ transform: "translate3d(0, 100%, 0)", opacity: "1" })
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
    })

    it("lift back reverses the vertical slide", () => {
        let t = viewSlideTransforms("back", "lift")
        expect(t.fromStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translate3d(0, 100%, 0)", opacity: "1" })
        expect(t.toStart).toEqual({ transform: "translate3d(0, -100%, 0)", opacity: "1" })
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
    })

    it("zoom forward leaves at scale(0.95) / 0 and enters scale(1.1) → scale(1)", () => {
        let t = viewSlideTransforms("forward", "zoom")
        expect(t.fromStart).toEqual({ transform: "scale(1)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "scale(0.95)", opacity: "0" })
        expect(t.toStart).toEqual({ transform: "scale(1.1)", opacity: "0" })
        expect(t.toEnd).toEqual({ transform: "scale(1)", opacity: "1" })
    })

    it("zoom back reverses scale-out and scale-in", () => {
        let t = viewSlideTransforms("back", "zoom")
        expect(t.fromStart).toEqual({ transform: "scale(1)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "scale(1.1)", opacity: "0" })
        expect(t.toStart).toEqual({ transform: "scale(0.95)", opacity: "0" })
        expect(t.toEnd).toEqual({ transform: "scale(1)", opacity: "1" })
    })

    it("reveal forward wipes the entering panel from inset(0 100% 0 0)", () => {
        let t = viewSlideTransforms("forward", "reveal")
        expect(t.fromStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.fromEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.toStart).toEqual({
            transform: "translate3d(0, 0, 0)",
            opacity: "1",
            clipPath: "inset(0 100% 0 0)",
        })
        expect(t.toEnd).toEqual({
            transform: "translate3d(0, 0, 0)",
            opacity: "1",
            clipPath: "inset(0 0 0 0)",
        })
    })

    it("reveal back wipes the leaving panel", () => {
        let t = viewSlideTransforms("back", "reveal")
        expect(t.fromStart).toEqual({
            transform: "translate3d(0, 0, 0)",
            opacity: "1",
            clipPath: "inset(0 0 0 0)",
        })
        expect(t.fromEnd).toEqual({
            transform: "translate3d(0, 0, 0)",
            opacity: "1",
            clipPath: "inset(0 100% 0 0)",
        })
        expect(t.toStart).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
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
    it("cover, push, and crossfade use 350ms; cover uses spring ease", () => {
        expect(viewSlideDurationMs("cover")).toBe(350)
        expect(viewSlideEasing("cover")).toBe(MOTION_SPRING_EASE)
        expect(viewSlideDurationMs("push")).toBe(350)
        expect(viewSlideDurationMs("crossfade")).toBe(350)
        expect(viewSlideEasing("push")).toBe(MOTION_EASE)
        expect(viewSlideEasing("crossfade")).toBe(MOTION_EASE)
    })

    it("peek and lift use 350ms default ease", () => {
        expect(viewSlideDurationMs("peek")).toBe(350)
        expect(viewSlideDurationMs("lift")).toBe(350)
        expect(viewSlideEasing("peek")).toBe(MOTION_EASE)
        expect(viewSlideEasing("lift")).toBe(MOTION_EASE)
    })

    it("zoom uses 350ms spring ease; reveal stays 350ms ease-in", () => {
        expect(viewSlideDurationMs("zoom")).toBe(350)
        expect(viewSlideEasing("zoom")).toBe(MOTION_SPRING_EASE)
        expect(viewSlideDurationMs("reveal")).toBe(350)
        expect(viewSlideEasing("reveal")).toBe("ease-in")
    })
})
