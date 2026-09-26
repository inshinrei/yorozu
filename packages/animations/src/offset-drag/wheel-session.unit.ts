import { afterEach, describe, expect, it, vi } from "vitest"
import {
    WHEEL_COOLDOWN_MS,
    WHEEL_MOMENTUM_ACCEL_MAX,
    WHEEL_MOMENTUM_ACCEL_MIN,
    WHEEL_MOMENTUM_DT_MS,
    WHEEL_MOMENTUM_PEAK_PX,
    WHEEL_MOMENTUM_WINDOW,
    WHEEL_QUIET_PX,
    WHEEL_RELEASE_MS,
    createWheelSession,
    isQuietWheel,
} from "./wheel-session"

describe("createWheelSession", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it("exports quiet / release / cooldown / momentum tokens", () => {
        expect(WHEEL_QUIET_PX).toBe(10)
        expect(WHEEL_RELEASE_MS).toBe(140)
        expect(WHEEL_COOLDOWN_MS).toBe(420)
        expect(WHEEL_MOMENTUM_DT_MS).toBe(40)
        expect(WHEEL_MOMENTUM_ACCEL_MIN).toBe(0.55)
        expect(WHEEL_MOMENTUM_ACCEL_MAX).toBe(0.97)
        expect(WHEEL_MOMENTUM_PEAK_PX).toBe(18)
        expect(WHEEL_MOMENTUM_WINDOW).toBe(4)
        expect(isQuietWheel(0, 0)).toBe(true)
        expect(isQuietWheel(9, 9)).toBe(true)
        expect(isQuietWheel(10, 0)).toBe(false)
    })

    it("zero-delta after a move does not release at 90ms; releases at 140ms after last note", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(80, 0)).toBe("move")
        expect(wheel.active()).toBe(true)
        vi.advanceTimersByTime(50)
        expect(wheel.note(0, 0)).toBe("quiet")
        vi.advanceTimersByTime(40)
        expect(onRelease).not.toHaveBeenCalled()
        expect(wheel.active()).toBe(true)
        vi.advanceTimersByTime(50)
        expect(onRelease).not.toHaveBeenCalled()
        expect(wheel.active()).toBe(true)
        vi.advanceTimersByTime(50)
        expect(onRelease).toHaveBeenCalledTimes(1)
        expect(wheel.active()).toBe(false)
        wheel.destroy()
    })

    it("sub-quiet 5px ticks are move and rearm idle", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(5, 0)).toBe("move")
        vi.advanceTimersByTime(90)
        expect(onRelease).not.toHaveBeenCalled()
        expect(wheel.note(5, 0)).toBe("move")
        vi.advanceTimersByTime(90)
        expect(onRelease).not.toHaveBeenCalled()
        vi.advanceTimersByTime(50)
        expect(onRelease).toHaveBeenCalledTimes(1)
        wheel.destroy()
    })

    it("twelve 20px ticks 16ms apart do not release until 140ms after the last", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        for (let i = 0; i < 12; i++) {
            if (i > 0) vi.advanceTimersByTime(16)
            expect(wheel.note(20, 0)).toBe("move")
        }
        expect(onRelease).not.toHaveBeenCalled()
        vi.advanceTimersByTime(90)
        expect(onRelease).not.toHaveBeenCalled()
        vi.advanceTimersByTime(50)
        expect(onRelease).toHaveBeenCalledTimes(1)
        wheel.destroy()
    })

    it("momentum true after contact is coast and releases once", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(80, 0)).toBe("move")
        expect(wheel.note(80, 0, { momentum: true })).toBe("coast")
        expect(onRelease).toHaveBeenCalledTimes(1)
        expect(wheel.note(40, 0, { momentum: true })).toBe("coast")
        expect(onRelease).toHaveBeenCalledTimes(1)
        wheel.destroy()
    })

    it("momentum leftovers rearm idle so a later tick stays coast", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(80, 0)).toBe("move")
        expect(wheel.note(40, 0, { momentum: true })).toBe("coast")
        expect(onRelease).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(50)
        expect(wheel.note(20, 0, { momentum: true })).toBe("coast")
        vi.advanceTimersByTime(90)
        expect(wheel.note(5, 0)).toBe("coast")
        expect(onRelease).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(WHEEL_RELEASE_MS)
        expect(wheel.note(5, 0)).toBe("move")
        wheel.destroy()
    })

    it("momentum true from idle stays coast and does not start contact", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(40, 0, { momentum: true })).toBe("coast")
        expect(onRelease).not.toHaveBeenCalled()
        expect(wheel.active()).toBe(false)
        expect(wheel.note(5, 0)).toBe("coast")
        expect(onRelease).not.toHaveBeenCalled()
        wheel.destroy()
    })

    it("decaying contact ticks become coast on the fourth sample", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(80, 0, { timeStamp: 0 })).toBe("move")
        expect(wheel.note(64, 0, { timeStamp: 16 })).toBe("move")
        expect(wheel.note(50, 0, { timeStamp: 32 })).toBe("move")
        expect(wheel.note(38, 0, { timeStamp: 48 })).toBe("coast")
        expect(onRelease).toHaveBeenCalledTimes(1)
        wheel.destroy()
    })

    it("slow 5px ticks never trip decay", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        for (let i = 0; i < 6; i++) {
            expect(wheel.note(5, 0, { timeStamp: i * 16 })).toBe("move")
        }
        expect(onRelease).not.toHaveBeenCalled()
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

    it("does not release a 120px tick until 140ms idle", () => {
        vi.useFakeTimers()
        let onRelease = vi.fn()
        let wheel = createWheelSession({ onRelease })
        expect(wheel.note(120, 0)).toBe("move")
        expect(onRelease).not.toHaveBeenCalled()
        vi.advanceTimersByTime(139)
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
