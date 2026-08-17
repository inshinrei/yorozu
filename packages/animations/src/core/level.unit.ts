import { describe, expect, it } from "vitest"
import {
    ANIMATION_LEVELS,
    DEFAULT_ANIMATION_LEVEL,
    canAnimate,
    cycleAnimationLevel,
    defaultAnimationLevel,
    isAnimationLevel,
    parseAnimationLevel,
    pickAnimationLevelFromRatio,
    stepAnimationLevel,
} from "./level"

describe("animation level", () => {
    it("lists low, med, high in that order", () => {
        expect(ANIMATION_LEVELS).toEqual(["low", "med", "high"])
    })

    it("defaults to high", () => {
        expect(DEFAULT_ANIMATION_LEVEL).toBe("high")
    })

    it("isAnimationLevel accepts only the three levels", () => {
        expect(isAnimationLevel("low")).toBe(true)
        expect(isAnimationLevel("med")).toBe(true)
        expect(isAnimationLevel("high")).toBe(true)
        expect(isAnimationLevel("off")).toBe(false)
        expect(isAnimationLevel(2)).toBe(false)
        expect(isAnimationLevel(null)).toBe(false)
    })

    it("parseAnimationLevel trims and lowercases", () => {
        expect(parseAnimationLevel(" MED ")).toBe("med")
        expect(parseAnimationLevel("High")).toBe("high")
        expect(parseAnimationLevel("nope")).toBeNull()
        expect(parseAnimationLevel(1)).toBeNull()
    })

    it("defaultAnimationLevel seeds med when reduced, else high", () => {
        expect(defaultAnimationLevel(true)).toBe("med")
        expect(defaultAnimationLevel(false)).toBe("high")
    })

    it("cycleAnimationLevel walks low → med → high → low", () => {
        expect(cycleAnimationLevel("low")).toBe("med")
        expect(cycleAnimationLevel("med")).toBe("high")
        expect(cycleAnimationLevel("high")).toBe("low")
    })

    it("canAnimate is false only for low", () => {
        expect(canAnimate("low")).toBe(false)
        expect(canAnimate("med")).toBe(true)
        expect(canAnimate("high")).toBe(true)
    })

    it("pickAnimationLevelFromRatio splits the track into thirds", () => {
        expect(pickAnimationLevelFromRatio(0)).toBe("low")
        expect(pickAnimationLevelFromRatio(0.32)).toBe("low")
        expect(pickAnimationLevelFromRatio(1 / 3)).toBe("med")
        expect(pickAnimationLevelFromRatio(0.65)).toBe("med")
        expect(pickAnimationLevelFromRatio(2 / 3)).toBe("high")
        expect(pickAnimationLevelFromRatio(1)).toBe("high")
    })

    it("stepAnimationLevel clamps at the ends", () => {
        expect(stepAnimationLevel("low", 1)).toBe("med")
        expect(stepAnimationLevel("med", 1)).toBe("high")
        expect(stepAnimationLevel("high", 1)).toBe("high")
        expect(stepAnimationLevel("high", -1)).toBe("med")
        expect(stepAnimationLevel("low", -1)).toBe("low")
        expect(stepAnimationLevel("med", -2)).toBe("low")
    })
})
