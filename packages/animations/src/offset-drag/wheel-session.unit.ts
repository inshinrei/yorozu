import { afterEach, describe, expect, it, vi } from "vitest"
import { WHEEL_COOLDOWN_MS, WHEEL_QUIET_PX, WHEEL_RELEASE_MS, createWheelSession, isQuietWheel } from "./wheel-session"

describe("createWheelSession", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it("exports quiet / release / cooldown tokens", () => {
        expect(WHEEL_QUIET_PX).toBe(10)
        expect(WHEEL_RELEASE_MS).toBe(90)
        expect(WHEEL_COOLDOWN_MS).toBe(420)
        expect(isQuietWheel(0, 0)).toBe(true)
        expect(isQuietWheel(9, 9)).toBe(true)
        expect(isQuietWheel(10, 0)).toBe(false)
    })

    it("starts on non-quiet, ignores quiet ticks, releases after 90ms", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(80, 0)).toBe("move")
        expect(wheel.active()).toBe(true)
        vi.advanceTimersByTime(50)
        expect(wheel.note(0, 0)).toBe("quiet")
        vi.advanceTimersByTime(40)
        expect(onRelease).toHaveBeenCalledTimes(1)
        expect(wheel.active()).toBe(false)
        wheel.destroy()
    })

    it("consume after destroy does not arm a cooldown", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        wheel.destroy()
        wheel.consume()
        expect(wheel.gated()).toBe(false)
        expect(onRelease).not.toHaveBeenCalled()
    })

    it("does not release a 120px tick until quiet idle (no early commit)", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(120, 0)).toBe("move")
        expect(onRelease).not.toHaveBeenCalled()
        vi.advanceTimersByTime(89)
        expect(onRelease).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(onRelease).toHaveBeenCalledTimes(1)
        wheel.destroy()
    })

    it("consume gates leftover until cooldown plus one quiet sample", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(80, 0)).toBe("move")
        wheel.consume()
        expect(wheel.gated()).toBe(true)
        expect(wheel.note(80, 0)).toBe("gated")
        vi.advanceTimersByTime(WHEEL_COOLDOWN_MS)
        expect(wheel.note(80, 0)).toBe("gated")
        expect(wheel.note(0, 0)).toBe("quiet")
        expect(wheel.gated()).toBe(false)
        expect(wheel.note(80, 0)).toBe("move")
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(onRelease).toHaveBeenCalledTimes(1)
        wheel.destroy()
    })

    it("leftover during cooldown does not restart the cooldown", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        wheel.note(80, 0)
        wheel.consume()
        for (let i = 0; i < 8; i++) {
            vi.advanceTimersByTime(50)
            expect(wheel.note(80, 0)).toBe("gated")
        }
        vi.advanceTimersByTime(WHEEL_COOLDOWN_MS - 400)
        expect(wheel.note(0, 0)).toBe("quiet")
        expect(wheel.note(80, 0)).toBe("move")
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(onRelease).toHaveBeenCalledTimes(1)
        wheel.destroy()
    })

    it("clear cancels a pending release", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        wheel.note(80, 0)
        wheel.clear()
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(onRelease).not.toHaveBeenCalled()
        expect(wheel.active()).toBe(false)
        expect(wheel.gated()).toBe(false)
        wheel.destroy()
    })
})
