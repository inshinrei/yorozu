import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHeavyAnimationLock, DEFAULT_HEAVY_LOCK_TIMEOUT_MS, type HeavyLockLevel } from "./heavy-lock"

describe("createHeavyAnimationLock", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("defaults timeout to 1000ms and is unlocked", () => {
        expect(DEFAULT_HEAVY_LOCK_TIMEOUT_MS).toBe(1000)
        let lock = createHeavyAnimationLock()
        expect(lock.isHeld()).toBe(false)
        expect(lock.level()).toBeNull()
    })

    it("refcounts nested acquire and last release unlocks", () => {
        let levels: HeavyLockLevel[] = []
        let unlocks = 0
        let lock = createHeavyAnimationLock({
            onLock: (level) => levels.push(level),
            onUnlock: () => {
                unlocks += 1
            },
        })
        let a = lock.acquire("slide")
        let b = lock.acquire("dock")
        expect(lock.isHeld()).toBe(true)
        expect(lock.level()).toBe("any")
        expect(levels).toEqual(["any"])
        a()
        expect(lock.isHeld()).toBe(true)
        expect(unlocks).toBe(0)
        b()
        expect(lock.isHeld()).toBe(false)
        expect(lock.level()).toBeNull()
        expect(unlocks).toBe(1)
        a()
        expect(unlocks).toBe(1)
    })

    it("upgrades to blocking and reports blocking until that token releases", () => {
        let levels: HeavyLockLevel[] = []
        let lock = createHeavyAnimationLock({
            onLock: (level) => levels.push(level),
        })
        let any = lock.acquire("io", { level: "any" })
        let blocking = lock.acquire("cover", { level: "blocking" })
        expect(lock.level()).toBe("blocking")
        expect(levels).toEqual(["any", "blocking"])
        blocking()
        expect(lock.level()).toBe("any")
        any()
        expect(lock.level()).toBeNull()
    })

    it("subscribe fires on hold, level change, and unlock", () => {
        let ticks = 0
        let lock = createHeavyAnimationLock()
        let stop = lock.subscribe(() => {
            ticks += 1
        })
        let a = lock.acquire("a")
        expect(ticks).toBe(1)
        lock.acquire("b")
        expect(ticks).toBe(1)
        let block = lock.acquire("c", { level: "blocking" })
        expect(ticks).toBe(2)
        block()
        expect(ticks).toBe(3)
        a()
        expect(lock.isHeld()).toBe(true)
        expect(ticks).toBe(3)
        stop()
        lock.acquire("late")
        expect(ticks).toBe(3)
    })

    it("auto-releases one token at durationMs", () => {
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        lock.acquire("short", { durationMs: 40 })
        expect(lock.isHeld()).toBe(true)
        vi.advanceTimersByTime(39)
        expect(lock.isHeld()).toBe(true)
        vi.advanceTimersByTime(1)
        expect(lock.isHeld()).toBe(false)
    })

    it("watchdog force-unlocks every token at timeoutMs", () => {
        let unlocks = 0
        let lock = createHeavyAnimationLock({
            timeoutMs: 1000,
            onUnlock: () => {
                unlocks += 1
            },
        })
        lock.acquire("one")
        lock.acquire("two", { level: "blocking" })
        vi.advanceTimersByTime(999)
        expect(lock.isHeld()).toBe(true)
        vi.advanceTimersByTime(1)
        expect(lock.isHeld()).toBe(false)
        expect(lock.level()).toBeNull()
        expect(unlocks).toBe(1)
    })

    it("timeoutMs <= 0 disables the watchdog", () => {
        let lock = createHeavyAnimationLock({ timeoutMs: 0 })
        lock.acquire("forever")
        vi.advanceTimersByTime(10_000)
        expect(lock.isHeld()).toBe(true)
    })
})
