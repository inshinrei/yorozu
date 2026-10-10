import { afterEach, describe, expect, it } from "vitest"
import { configure } from "./configure"
import { init } from "./logger"
import { reportError } from "./report"
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

describe("reportError", () => {
    it("logs Error as .error with { err }", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        let err = new Error("boom")
        reportError(init("s", "c"), err)
        expect(records).toHaveLength(1)
        expect(records[0].level).toBe("error")
        expect(records[0].msg).toBe("boom")
        expect(records[0].arguments).toEqual({ err })
    })

    it('warns never-happen for "{}" string and does not .error', () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        reportError(init("s", "c"), "{}")
        expect(records.some((r) => r.level === "error")).toBe(false)
        expect(records).toHaveLength(1)
        expect(records[0].level).toBe("warning")
        expect(records[0].msg).toBe("never-happen")
        expect(records[0].arguments).toEqual({ err: "{}" })
    })

    it("spreads extra onto the record arguments", () => {
        let { records, handler } = capture()
        configure({ handlers: [handler] })
        let err = new Error("boom")
        reportError(init(), err, { op: "save" })
        expect(records[0].arguments).toEqual({ err, op: "save" })
    })
})
