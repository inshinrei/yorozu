import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    buildDigitSlots,
    formatCounterText,
    MAX_SIMULTANEOUS_DIGIT_FLIPS,
    scheduleDigitFlip,
    shouldPresencePop,
} from "./slots"

describe("buildDigitSlots", () => {
    it("emits static slots when animation is off", () => {
        expect(buildDigitSlots("12", "11", false)).toEqual([
            { kind: "static", char: "1" },
            { kind: "static", char: "2" },
        ])
    })

    it("emits static slots when prev is missing", () => {
        expect(buildDigitSlots("12", undefined, true)).toEqual([
            { kind: "static", char: "1" },
            { kind: "static", char: "2" },
        ])
    })

    it("emits static slots when the text did not change", () => {
        expect(buildDigitSlots("42", "42", true)).toEqual([
            { kind: "static", char: "4" },
            { kind: "static", char: "2" },
        ])
    })

    it("flips only right-aligned changed characters", () => {
        expect(buildDigitSlots("13", "12", true)).toEqual([
            { kind: "static", char: "1" },
            { kind: "flip", char: "3", prevChar: "2" },
        ])
    })

    it("aligns from the right when the new text is longer", () => {
        expect(buildDigitSlots("100", "99", true)).toEqual([
            { kind: "flip", char: "1", prevChar: "" },
            { kind: "flip", char: "0", prevChar: "9" },
            { kind: "flip", char: "0", prevChar: "9" },
        ])
    })

    it("drops leftover prev characters when the new text is shorter", () => {
        expect(buildDigitSlots("9", "10", true)).toEqual([{ kind: "flip", char: "9", prevChar: "0" }])
    })

    it("returns an empty list for empty text", () => {
        expect(buildDigitSlots("", "1", true)).toEqual([])
    })
})

describe("formatCounterText", () => {
    it("caps at 999+", () => {
        expect(formatCounterText(0)).toBe("0")
        expect(formatCounterText(42)).toBe("42")
        expect(formatCounterText(999)).toBe("999")
        expect(formatCounterText(1000)).toBe("999+")
        expect(formatCounterText(10000)).toBe("999+")
    })
})

describe("shouldPresencePop", () => {
    it("is true only on a 0 → N cross", () => {
        expect(shouldPresencePop(0, 3)).toBe(true)
        expect(shouldPresencePop(0, 1)).toBe(true)
        expect(shouldPresencePop(undefined, 3)).toBe(false)
        expect(shouldPresencePop(2, 3)).toBe(false)
        expect(shouldPresencePop(3, 0)).toBe(false)
        expect(shouldPresencePop(0, 0)).toBe(false)
    })
})

describe("scheduleDigitFlip", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.runAllTimers()
    })

    afterEach(() => {
        vi.runAllTimers()
        vi.useRealTimers()
    })

    it("allows 10 flips per macrotask and no more", () => {
        expect(MAX_SIMULTANEOUS_DIGIT_FLIPS).toBe(10)
        for (let i = 0; i < 10; i++) {
            expect(scheduleDigitFlip(true)).toBe(true)
        }
        expect(scheduleDigitFlip(true)).toBe(false)
        expect(scheduleDigitFlip(false)).toBe(false)
        vi.advanceTimersByTime(0)
        expect(scheduleDigitFlip(true)).toBe(true)
    })

    it("does not consume budget when the condition is false", () => {
        expect(scheduleDigitFlip(false)).toBe(false)
        for (let i = 0; i < 10; i++) {
            expect(scheduleDigitFlip(true)).toBe(true)
        }
        expect(scheduleDigitFlip(true)).toBe(false)
    })
})
