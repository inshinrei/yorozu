import { afterEach, describe, expect, it, vi } from "vitest"
import { configure } from "./configure"
import { Level } from "./levels"
import type { LogLevel } from "./levels"
import { disabled, init } from "./logger"
import type { LogHandler, LogRecord } from "./types"

afterEach(() => {
    configure({})
})

function capture(): { records: LogRecord[]; handler: LogHandler } {
    let records: LogRecord[] = []
    return {
        records,
        handler: (record) => {
            records.push(record)
        },
    }
}

describe("init without handlers", () => {
    it("does not emit and isEnabled is false for every level", () => {
        let now = vi.spyOn(Date, "now")
        try {
            let log = init("s", "c")
            log.info("x", { n: 1 })
            expect(now).not.toHaveBeenCalled()
            for (let level of Object.values(Level)) {
                expect(log.isEnabled(level)).toBe(false)
            }
        } finally {
            now.mockRestore()
        }
    })
})

describe("isEnabled", () => {
    it("is true for trace when handlers are present and no level is set", () => {
        configure({ handlers: [() => {}] })
        expect(init().isEnabled("trace")).toBe(true)
    })

    it("uses the global minimum level", () => {
        configure({ handlers: [() => {}], level: "warning" })
        expect(init().isEnabled("info")).toBe(false)
        expect(init().isEnabled("warning")).toBe(true)
    })

    it("applies a subsystem filter and defaults other subsystems to trace", () => {
        configure({ handlers: [() => {}], subsystems: { db: { level: "error" } } })
        expect(init("db").isEnabled("warning")).toBe(false)
        expect(init("other").isEnabled("trace")).toBe(true)
    })

    it("applies a category override under a subsystem", () => {
        configure({
            handlers: [() => {}],
            subsystems: { db: { level: "error", categories: { sql: { level: "debug" } } } },
        })
        expect(init("db", "sql").isEnabled("debug")).toBe(true)
        expect(init("db", "txn").isEnabled("debug")).toBe(false)
    })
})

describe("emit", () => {
    it("delivers subsystem, category, level, msg, arguments, and timestamp", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        let before = Date.now()
        init("net", "http").info("up", { n: 1 })
        expect(records).toHaveLength(1)
        expect(records[0].subsystem).toBe("net")
        expect(records[0].category).toBe("http")
        expect(records[0].level).toBe("info")
        expect(records[0].msg).toBe("up")
        expect(records[0].arguments).toEqual({ n: 1 })
        expect(records[0].timestamp).toBeGreaterThanOrEqual(before)
        expect(records[0].timestamp).toBeLessThanOrEqual(Date.now())
    })

    it("defaults omitted arguments to {}", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        init().info("x")
        expect(records[0].arguments).toEqual({})
    })

    it("ignores later mutation of the caller's arguments object", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        let args = { n: 1 }
        init().info("x", args)
        args.n = 2
        expect(records[0].arguments).toEqual({ n: 1 })
    })

    it("does not invoke the handler when the level is disabled", () => {
        let handler = vi.fn()
        configure({ handlers: [handler], level: "warning" })
        init().info("x")
        expect(handler).not.toHaveBeenCalled()
    })

    it("has warning and no warn", () => {
        let log = init()
        expect(typeof log.warning).toBe("function")
        expect((log as { warn?: unknown }).warn).toBeUndefined()
    })

    it("takes error as a message string", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        let err = new Error("boom")
        init().error("boom", { err })
        expect(records[0].level).toBe("error")
        expect(records[0].msg).toBe("boom")
        expect(records[0].arguments.err).toBe(err)
    })

    it("swallows handler throws and still runs later handlers", () => {
        let later = vi.fn()
        configure({
            handlers: [
                () => {
                    throw new Error("handler")
                },
                later,
            ],
        })
        expect(() => init().info("x")).not.toThrow()
        expect(later).toHaveBeenCalledOnce()
    })

    it("starts delivering to handlers configured after init", () => {
        let log = init("s", "c")
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        log.info("hi")
        expect(records).toHaveLength(1)
        expect(records[0].msg).toBe("hi")
    })

    it("dispatches a snapshot so configure inside a handler does not see new handlers this emit", () => {
        let records: LogRecord[] = []
        let late: LogHandler = (record) => {
            records.push(record)
        }
        configure({
            handlers: [
                (record) => {
                    records.push(record)
                    configure({ handlers: [late] })
                },
            ],
        })
        init("s").info("outer")
        expect(records).toHaveLength(1)
        expect(records[0].msg).toBe("outer")
        init("s").info("next")
        expect(records).toHaveLength(2)
        expect(records[1].msg).toBe("next")
    })

    it("ignores nested emit from a handler", () => {
        let records: LogRecord[] = []
        configure({
            handlers: [
                (record) => {
                    records.push(record)
                    init("s").info("nested")
                },
            ],
        })
        init("s").info("outer")
        expect(records).toHaveLength(1)
        expect(records[0].msg).toBe("outer")
    })
})

describe(".log", () => {
    it("defaults .log(msg) to notice", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        init().log("hello")
        expect(records[0].level).toBe("notice")
        expect(records[0].msg).toBe("hello")
    })

    it("logs the message debug at notice when called with a single LogLevel string", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        init().log("debug")
        expect(records).toHaveLength(1)
        expect(records[0].level).toBe("notice")
        expect(records[0].msg).toBe("debug")
    })

    it("uses the level string form", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        init().log("error", "boom")
        expect(records[0].level).toBe("error")
        expect(records[0].msg).toBe("boom")
    })

    it("uses the object form", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        init().log({ level: "fault" }, "x")
        expect(records[0].level).toBe("fault")
        expect(records[0].msg).toBe("x")
    })

    it("throws TypeError when the object form has no valid level", () => {
        configure({ handlers: [() => {}] })
        expect(() => init().log({} as { level: LogLevel }, "x")).toThrow(TypeError)
        expect(() => init().log({} as { level: LogLevel }, "x")).toThrow(/log\(\) object form requires \{ level \}/)
    })

    it("throws TypeError when the level form is missing a msg string", () => {
        configure({ handlers: [() => {}] })
        expect(() => init().log("debug", { a: 1 } as never)).toThrow(TypeError)
        expect(() => init().log("debug", { a: 1 } as never)).toThrow(/log\(\) requires msg string/)
    })
})

describe("init cache and identity", () => {
    it("returns the same instance for the same subsystem and category", () => {
        expect(init("a", "b")).toBe(init("a", "b"))
    })

    it("uses empty strings when subsystem and category are omitted", () => {
        let log = init()
        expect(log.subsystem).toBe("")
        expect(log.category).toBe("")
        expect(init(undefined, undefined)).toBe(log)
    })
})

describe("disabled", () => {
    it("never delivers even when global handlers are set", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        disabled.info("x")
        expect(records).toHaveLength(0)
        expect(disabled.isEnabled("critical")).toBe(false)
    })
})
