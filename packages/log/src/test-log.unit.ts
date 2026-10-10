import { afterEach, describe, expect, it, vi } from "vitest"
import { configure, getConfig } from "./configure"
import { Level } from "./levels"
import { createTestLog } from "./test-log"

afterEach(() => {
    configure({})
})

describe("createTestLog", () => {
    it("collects a record with subsystem, category, level, msg, and arguments", () => {
        let log = createTestLog("s", "c")
        let before = Date.now()
        log.info("m", { k: 1 })
        let rec = log.collect()[0]
        expect(rec.subsystem).toBe("s")
        expect(rec.category).toBe("c")
        expect(rec.level).toBe("info")
        expect(rec.msg).toBe("m")
        expect(rec.arguments).toEqual({ k: 1 })
        expect(rec.timestamp).toBeGreaterThanOrEqual(before)
        expect(rec.timestamp).toBeLessThanOrEqual(Date.now())
    })

    it("clear empties the buffer", () => {
        let log = createTestLog()
        log.info("m")
        log.clear()
        expect(log.collect()).toEqual([])
    })

    it("returns a detached copy from collect", () => {
        let log = createTestLog()
        log.info("m")
        let first = log.collect()
        first.push(first[0])
        expect(log.collect()).toHaveLength(1)
    })

    it("does not read or write the global config", () => {
        let spy = vi.fn()
        configure({ handlers: [spy] })
        let log = createTestLog("s", "c")
        log.info("m")
        expect(spy).not.toHaveBeenCalled()
        expect(log.collect()).toHaveLength(1)
        expect(getConfig().handlers).toEqual([spy])
    })

    it("isEnabled is true for every level even with no global handlers", () => {
        configure({})
        let log = createTestLog()
        for (let level of Object.values(Level)) {
            expect(log.isEnabled(level)).toBe(true)
        }
        expect(log.subsystem).toBe("")
        expect(log.category).toBe("")
    })
})
