import { beforeEach, describe, expect, it } from "vitest"
import type { FetchAddon } from "../../types"
import { form } from "./form"

describe("form addon", () => {
    let addon: FetchAddon<any, any>
    let ctx: any

    beforeEach(() => {
        addon = form()
        ctx = {
            options: {},
            baseOptions: {},
            url: "https://example.com",
        }
    })

    it("does nothing when no form is present", () => {
        addon.beforeRequest!(ctx)
        expect(ctx.options.body).toBeUndefined()
    })

    it("uses form from options and sets body + POST + header", () => {
        ctx.options.form = { name: "grok", age: 1 }

        addon.beforeRequest!(ctx)

        expect(ctx.options.body).toBe("name=grok&age=1")
        expect(ctx.options.method).toBe("POST")
        expect(ctx.options.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" })
    })

    it("falls back to baseOptions.form", () => {
        ctx.baseOptions.form = { token: "secret" }
        ctx.options.method = "PATCH"

        addon.beforeRequest!(ctx)

        expect(ctx.options.body).toBe("token=secret")
        expect(ctx.options.method).toBe("PATCH")
    })

    it("throws when both form and body are set", () => {
        ctx.options.form = { foo: "bar" }
        ctx.options.body = "already here"

        expect(() => addon.beforeRequest!(ctx)).toThrow("Cannot set both form and body.")
    })

    it("uses custom serialize function", () => {
        let called = false
        let customSerialize = (data: Record<string, unknown>) => {
            called = true
            return JSON.stringify(data)
        }

        addon = form({ serialize: customSerialize })
        ctx.options.form = { a: 1, b: 2 }

        addon.beforeRequest!(ctx)

        expect(called).toBe(true)
        expect(ctx.options.body).toBe('{"a":1,"b":2}')
    })

    it("default serialize skips null/undefined and handles arrays", () => {
        ctx.options.form = {
            a: null,
            b: undefined,
            c: 42,
            tags: ["x", "y"],
        }

        addon.beforeRequest!(ctx)

        expect(ctx.options.body).toBe("c=42&tags=x&tags=y")
    })

    it("sets Content-Type even if headers already exist (object)", () => {
        ctx.options.headers = { "user-agent": "test" }
        ctx.options.form = { hello: "world" }

        addon.beforeRequest!(ctx)

        expect(ctx.options.headers).toEqual({
            "user-agent": "test",
            "Content-Type": "application/x-www-form-urlencoded",
        })
    })

    it("does nothing when form is null", () => {
        ctx.options.form = null
        addon.beforeRequest!(ctx)
        expect(ctx.options.body).toBeUndefined()
        expect(ctx.options.method).toBeUndefined()
    })

    it("overrides baseOptions.form completely (does not merge)", () => {
        ctx.baseOptions.form = { a: 1, b: 2 }
        ctx.options.form = { b: 9 }
        addon.beforeRequest!(ctx)
        expect(ctx.options.body).toBe("b=9")
    })

    it("still applies an empty form object", () => {
        ctx.options.form = {}
        addon.beforeRequest!(ctx)
        expect(ctx.options.body).toBe("")
        expect(ctx.options.method).toBe("POST")
        expect(ctx.options.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" })
    })

    it("sets Content-Type on a Headers instance", () => {
        ctx.options.headers = new Headers({ "user-agent": "test" })
        ctx.options.form = { hello: "world" }
        addon.beforeRequest!(ctx)
        expect((ctx.options.headers as Headers).get("content-type")).toBe("application/x-www-form-urlencoded")
        expect((ctx.options.headers as Headers).get("user-agent")).toBe("test")
    })
})
