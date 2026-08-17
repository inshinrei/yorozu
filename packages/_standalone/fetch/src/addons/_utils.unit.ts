import { beforeEach, describe, expect, it } from "vitest"
import type { FetchOptions } from "../types"

import { setHeader, urlencode } from "./_utils"

describe("ffetch utils", () => {
    describe("urlencode", () => {
        it("returns empty URLSearchParams for empty object", () => {
            let params = urlencode({})
            expect([...params.entries()]).toEqual([])
        })

        it("skips null, undefined, objects and functions", () => {
            let params = urlencode({
                a: null,
                b: undefined,
                c: 42,
                d: { nested: true },
                e: () => {},
                f: "hello",
                g: true,
            })
            expect([...params.entries()]).toEqual([
                ["c", "42"],
                ["f", "hello"],
                ["g", "true"],
            ])
        })

        it("properly handles arrays with mixed null/undefined", () => {
            let params = urlencode({ tags: ["a", null, "b", undefined, 123] })
            expect([...params.entries()]).toEqual([
                ["tags", "a"],
                ["tags", "b"],
                ["tags", "123"],
            ])
        })

        it("stringifies primitives and uses set", () => {
            let params = urlencode({ str: "hello", num: 123, bool: true, zero: 0 })
            expect([...params.entries()]).toEqual([
                ["str", "hello"],
                ["num", "123"],
                ["bool", "true"],
                ["zero", "0"],
            ])
        })

        it("appends multiple values for arrays", () => {
            let params = urlencode({ tags: ["a", "b", "c"], ids: [1, 2] })
            expect([...params.entries()]).toEqual([
                ["tags", "a"],
                ["tags", "b"],
                ["tags", "c"],
                ["ids", "1"],
                ["ids", "2"],
            ])
        })
    })

    describe("setHeader", () => {
        let options: FetchOptions

        beforeEach(() => {
            options = {}
        })

        it("creates headers object when none exists (value present)", () => {
            setHeader(options, "content-type", "application/json")
            expect(options.headers).toEqual({ "content-type": "application/json" })
        })

        it("does nothing when creating and value is null", () => {
            setHeader(options, "x-foo", null)
            expect(options.headers).toBeUndefined()
        })

        it("sets value on plain object headers", () => {
            options.headers = { "user-agent": "old" }
            setHeader(options, "content-type", "application/json")
            expect(options.headers).toEqual({
                "user-agent": "old",
                "content-type": "application/json",
            })
        })

        it("deletes from plain object when value is null", () => {
            options.headers = { "x-foo": "bar", "x-baz": "qux" }
            setHeader(options, "x-foo", null)
            expect(options.headers).toEqual({ "x-baz": "qux" })
        })

        it("works with Headers instance", () => {
            options.headers = new Headers({ "x-foo": "bar" })
            setHeader(options, "content-type", "application/json")
            expect((options.headers as Headers).get("content-type")).toBe("application/json")

            setHeader(options, "x-foo", null)
            expect((options.headers as Headers).has("x-foo")).toBe(false)
        })

        it("works with array-of-tuples headers", () => {
            options.headers = [["x-foo", "bar"]]
            setHeader(options, "content-type", "application/json")
            expect(options.headers).toEqual([
                ["x-foo", "bar"],
                ["content-type", "application/json"],
            ])

            setHeader(options, "x-foo", null)
            expect(options.headers).toEqual([["content-type", "application/json"]])
        })

        it("converts iterable headers to object when needed", () => {
            let iterable = new Map([["x-foo", "bar"]])
            options.headers = iterable as any

            setHeader(options, "content-type", "application/json")
            expect(options.headers).toEqual({
                "x-foo": "bar",
                "content-type": "application/json",
            })
        })

        it("handles multiple setHeader calls on array format", () => {
            options.headers = []
            setHeader(options, "a", "1")
            setHeader(options, "b", "2")
            setHeader(options, "a", null)
            expect(options.headers).toEqual([["b", "2"]])
        })
    })
})
