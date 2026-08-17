import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { FetchLike } from "../../types"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import * as v from "valibot"
import * as y from "yup"
import { createFetch } from "../../client"
import { parser, SchemaValidationError } from "./addon"

function fakeSchema<T>(
    validate: (value: unknown) => StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>,
): StandardSchemaV1 {
    return {
        "~standard": {
            version: 1,
            vendor: "test",
            validate,
        },
    } as StandardSchemaV1
}

function mockFetch(body: string): FetchLike {
    let fetch_ = vi.fn<FetchLike>(async () => new Response(body))
    return fetch_
}

describe("SchemaValidationError", () => {
    it("uses a stable name and base message when there are no issues", () => {
        let err = new SchemaValidationError([])
        expect(err.name).toBe("SchemaValidationError")
        expect(err).toBeInstanceOf(Error)
        expect(err.message).toBe("Schema validation failed")
        expect(err.issues).toEqual([])
    })

    it("appends issue messages without a path", () => {
        let err = new SchemaValidationError([{ message: "required" }])
        expect(err.message).toBe("Schema validation failed: required")
    })

    it("formats primitive and object path segments, skips empty path", () => {
        let err = new SchemaValidationError([
            { message: "bad", path: ["user", { key: "age" }] },
            { message: "also", path: [] },
        ])
        expect(err.message).toBe("Schema validation failed: bad at .user.age: also")
    })
})

describe("parser addon", () => {
    it("parsedJson returns the validated value", async () => {
        let ffetch = createFetch({
            fetch: mockFetch('{"a":1}'),
            addons: [parser()],
        })
        let schema = fakeSchema((value) => ({ value }))
        expect(await ffetch("https://example.com").parsedJson(schema)).toEqual({ a: 1 })
    })

    it("parsedJson awaits an async Standard Schema validate", async () => {
        let ffetch = createFetch({
            fetch: mockFetch('{"ok":true}'),
            addons: [parser()],
        })
        let schema = fakeSchema(async (value) => ({ value }))
        expect(await ffetch("https://example.com").parsedJson(schema)).toEqual({ ok: true })
    })

    it("parsedJson throws SchemaValidationError with the schema issues", async () => {
        let ffetch = createFetch({
            fetch: mockFetch("{}"),
            addons: [parser()],
        })
        let issues: StandardSchemaV1.Issue[] = [{ message: "missing a", path: ["a"] }]
        let schema = fakeSchema(() => ({ issues }))
        let err = await ffetch("https://example.com")
            .parsedJson(schema)
            .then(
                () => {
                    throw new Error("expected throw")
                },
                (e) => e,
            )
        expect(err).toBeInstanceOf(SchemaValidationError)
        expect(err.issues).toBe(issues)
        expect(err.message).toBe("Schema validation failed: missing a at .a")
    })

    it("safelyParsedJson returns success and failure results without throwing", async () => {
        let ok = createFetch({ fetch: mockFetch('{"a":1}'), addons: [parser()] })
        let bad = createFetch({ fetch: mockFetch("{}"), addons: [parser()] })
        let pass = fakeSchema((value) => ({ value }))
        let fail = fakeSchema(() => ({ issues: [{ message: "nope" }] }))

        let passed = await ok("https://example.com").safelyParsedJson(pass)
        expect(passed.issues).toBeUndefined()
        if (!passed.issues) expect(passed.value).toEqual({ a: 1 })

        let failed = await bad("https://example.com").safelyParsedJson(fail)
        expect(failed.issues).toEqual([{ message: "nope" }])
    })
})

describe("parser + zod", () => {
    it("parsedJson pass / fail and safelyParsedJson", async () => {
        let schema = z.object({ a: z.number() })
        let pass = createFetch({ fetch: mockFetch('{"a":42}'), addons: [parser()] })
        let fail = createFetch({ fetch: mockFetch('{"b":42}'), addons: [parser()] })

        expect(await pass("https://example.com").parsedJson(schema)).toEqual({ a: 42 })
        await expect(fail("https://example.com").parsedJson(schema)).rejects.toBeInstanceOf(SchemaValidationError)

        let safeOk = await pass("https://example.com").safelyParsedJson(schema)
        expect(safeOk.issues).toBeUndefined()
        let safeBad = await fail("https://example.com").safelyParsedJson(schema)
        expect(safeBad.issues?.length).toBeGreaterThan(0)
    })
})

describe("parser + valibot", () => {
    it("parsedJson pass / fail", async () => {
        let schema = v.object({ a: v.number() })
        let pass = createFetch({ fetch: mockFetch('{"a":42}'), addons: [parser()] })
        let fail = createFetch({ fetch: mockFetch('{"b":42}'), addons: [parser()] })
        expect(await pass("https://example.com").parsedJson(schema)).toEqual({ a: 42 })
        await expect(fail("https://example.com").parsedJson(schema)).rejects.toBeInstanceOf(SchemaValidationError)
    })
})

describe("parser + yup", () => {
    it("parsedJson pass / fail", async () => {
        let schema = y.object({ a: y.number().required() })
        let pass = createFetch({ fetch: mockFetch('{"a":42}'), addons: [parser()] })
        let fail = createFetch({ fetch: mockFetch('{"b":42}'), addons: [parser()] })
        expect(await pass("https://example.com").parsedJson(schema)).toEqual({ a: 42 })
        await expect(fail("https://example.com").parsedJson(schema)).rejects.toBeInstanceOf(SchemaValidationError)
    })
})
