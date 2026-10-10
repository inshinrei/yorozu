import { describe, expect, it } from "vitest"
import { serializeArgs } from "./serialize"

describe("serializeArgs", () => {
    it("round-trips plain objects", () => {
        expect(serializeArgs({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" })
    })

    it("turns Error into name, message, and stack", () => {
        let err = new Error("boom")
        expect(serializeArgs({ err })).toEqual({
            err: {
                name: "Error",
                message: "boom",
                stack: err.stack,
            },
        })
    })

    it("drops functions", () => {
        expect(serializeArgs({ fn: () => 1 })).toEqual({})
    })

    it("drops bigint", () => {
        expect(serializeArgs({ n: 1n, a: 1 })).toEqual({ a: 1 })
    })

    it("returns _unserializable on circular objects", () => {
        let circular: Record<string, unknown> = { a: 1 }
        circular.self = circular
        expect(serializeArgs(circular)).toEqual({ _unserializable: true })
    })
})
