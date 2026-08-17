import { beforeEach, describe, expect, it } from "vitest"
import type { FetchAddon } from "../../types"
import { multipart } from "./multipart"

function entries(body: FormData) {
    return [...body.entries()].map(([key, value]) =>
        value instanceof Blob
            ? { key, kind: value instanceof File ? "file" : "blob", name: value instanceof File ? value.name : undefined, type: value.type }
            : { key, value },
    )
}

describe("multipart addon", () => {
    let addon: FetchAddon<any, any>
    let ctx: any

    beforeEach(() => {
        addon = multipart()
        ctx = { options: {}, baseOptions: {}, url: "https://example.com" }
    })

    it("does nothing when no multipart is present", () => {
        addon.beforeRequest!(ctx)
        expect(ctx.options.body).toBeUndefined()
    })

    it("uses multipart from options, defaults method to POST, clears Content-Type", () => {
        ctx.options.headers = { "Content-Type": "application/json", "user-agent": "test" }
        ctx.options.multipart = { foo: "bar", n: 1 }

        addon.beforeRequest!(ctx)

        expect(ctx.options.body).toBeInstanceOf(FormData)
        expect(ctx.options.method).toBe("POST")
        expect(ctx.options.headers).toEqual({ "user-agent": "test" })
        expect(entries(ctx.options.body)).toEqual([
            { key: "foo", value: "bar" },
            { key: "n", value: "1" },
        ])
    })

    it("falls back to baseOptions.multipart and keeps an explicit method", () => {
        ctx.baseOptions.multipart = { token: "secret" }
        ctx.options.method = "PATCH"
        addon.beforeRequest!(ctx)
        expect(ctx.options.method).toBe("PATCH")
        expect(entries(ctx.options.body)).toEqual([{ key: "token", value: "secret" }])
    })

    it("overrides baseOptions.multipart completely", () => {
        ctx.baseOptions.multipart = { a: 1, b: 2 }
        ctx.options.multipart = { b: 9 }
        addon.beforeRequest!(ctx)
        expect(entries(ctx.options.body)).toEqual([{ key: "b", value: "9" }])
    })

    it("throws when both multipart and body are set", () => {
        ctx.options.multipart = { foo: "bar" }
        ctx.options.body = "already here"
        expect(() => addon.beforeRequest!(ctx)).toThrow("Cannot set both multipart and body.")
    })

    it("uses a custom serialize function", () => {
        let data = new FormData()
        data.append("x", "1")
        addon = multipart({ serialize: () => data })
        ctx.options.multipart = { ignored: true }
        addon.beforeRequest!(ctx)
        expect(ctx.options.body).toBe(data)
    })

    it("skips null, undefined, plain objects and functions; keeps 0 and false", () => {
        ctx.options.multipart = {
            a: null,
            b: undefined,
            c: 0,
            d: false,
            e: { nested: true },
            f: () => {},
            g: "ok",
        }
        addon.beforeRequest!(ctx)
        expect(entries(ctx.options.body)).toEqual([
            { key: "c", value: "0" },
            { key: "d", value: "false" },
            { key: "g", value: "ok" },
        ])
    })

    it("appends File with its name and Blob as-is, including inside arrays", () => {
        let file = new File(["hello"], "hello.txt", { type: "text/plain" })
        let blob = new Blob(["bin"], { type: "application/octet-stream" })
        ctx.options.multipart = {
            file,
            blob,
            files: [file, null, blob],
            tags: ["x", undefined, "y"],
        }
        addon.beforeRequest!(ctx)
        // Node FormData promotes a bare Blob to File with name "blob" on read-back
        expect(entries(ctx.options.body)).toEqual([
            { key: "file", kind: "file", name: "hello.txt", type: "text/plain" },
            { key: "blob", kind: "file", name: "blob", type: "application/octet-stream" },
            { key: "files", kind: "file", name: "hello.txt", type: "text/plain" },
            { key: "files", kind: "file", name: "blob", type: "application/octet-stream" },
            { key: "tags", value: "x" },
            { key: "tags", value: "y" },
        ])
    })

    it("deletes Content-Type from a Headers instance so fetch can set the boundary", () => {
        ctx.options.headers = new Headers({ "content-type": "application/json", "x-foo": "bar" })
        ctx.options.multipart = { a: "b" }
        addon.beforeRequest!(ctx)
        expect((ctx.options.headers as Headers).has("content-type")).toBe(false)
        expect((ctx.options.headers as Headers).get("x-foo")).toBe("bar")
    })
})
