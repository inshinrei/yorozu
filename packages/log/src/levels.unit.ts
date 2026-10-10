import { describe, expect, it } from "vitest"
import { isLogLevel, Level, rank } from "./levels"
import type { LogLevel } from "./levels"

describe("Level", () => {
    it("exposes lowercase level strings matching method names", () => {
        expect(Level.trace).toBe("trace")
        expect(Level.debug).toBe("debug")
        expect(Level.info).toBe("info")
        expect(Level.notice).toBe("notice")
        expect(Level.warning).toBe("warning")
        expect(Level.error).toBe("error")
        expect(Level.fault).toBe("fault")
        expect(Level.critical).toBe("critical")
    })
})

describe("rank", () => {
    it("orders trace < debug < info < notice < warning < error < fault < critical", () => {
        let order: LogLevel[] = [
            Level.trace,
            Level.debug,
            Level.info,
            Level.notice,
            Level.warning,
            Level.error,
            Level.fault,
            Level.critical,
        ]
        for (let i = 0; i < order.length - 1; i++) {
            expect(rank(order[i])).toBeLessThan(rank(order[i + 1]))
        }
    })
})

describe("isLogLevel", () => {
    it("accepts each Level string", () => {
        expect(isLogLevel("trace")).toBe(true)
        expect(isLogLevel("debug")).toBe(true)
        expect(isLogLevel("info")).toBe(true)
        expect(isLogLevel("notice")).toBe(true)
        expect(isLogLevel("warning")).toBe(true)
        expect(isLogLevel("error")).toBe(true)
        expect(isLogLevel("fault")).toBe(true)
        expect(isLogLevel("critical")).toBe(true)
    })

    it("rejects uppercase, warn, empty, and non-strings", () => {
        expect(isLogLevel("INFO")).toBe(false)
        expect(isLogLevel("warn")).toBe(false)
        expect(isLogLevel("")).toBe(false)
        expect(isLogLevel(undefined)).toBe(false)
        expect(isLogLevel(null)).toBe(false)
        expect(isLogLevel(1)).toBe(false)
    })

    it("rejects Object.prototype names", () => {
        expect(isLogLevel("toString")).toBe(false)
        expect(isLogLevel("constructor")).toBe(false)
        expect(isLogLevel("valueOf")).toBe(false)
    })
})
