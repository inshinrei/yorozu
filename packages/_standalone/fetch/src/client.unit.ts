import type { FetchAddon, FetchLike, FetchMiddleware } from "./types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFetch, HttpError } from "./client"

let fetch_ = vi.fn<FetchLike>(async () => new Response("OK"))
let client = createFetch({ fetch: fetch_ })

describe("createFetch", () => {
    beforeEach(() => {
        fetch_.mockClear()
        fetch_.mockImplementation(async () => new Response("OK"))
    })

    it("sends GET by default", async () => {
        let res = await client("https://example.com")
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/")
        expect(await res.text()).toBe("OK")
    })

    it("sends POST with a body", async () => {
        await client("https://example.com", { method: "POST", body: new Uint8Array([1, 2, 3]) })
        let req = fetch_.mock.calls[0][0] as Request
        expect(req.method).toBe("POST")
    })

    it("does not prepend baseUrl onto an absolute url", async () => {
        await client("https://example.com", { baseUrl: "https://base.com" })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/")
    })

    it("joins baseUrl with a path", async () => {
        await client("/path", { baseUrl: "https://base.com" })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://base.com/path")
    })

    it("joins baseUrl that already has a path, with or without slashes", async () => {
        let a = createFetch({ fetch: fetch_, baseUrl: "https://base.com/api" })
        let b = createFetch({ fetch: fetch_, baseUrl: "https://base.com/api/" })
        await a("/v1/users")
        await a("v1/users")
        await b("/v1/users")
        await b("v1/users")
        expect(fetch_.mock.calls.map(([req]) => (req as Request).url)).toEqual([
            "https://base.com/api/v1/users",
            "https://base.com/api/v1/users",
            "https://base.com/api/v1/users",
            "https://base.com/api/v1/users",
        ])
    })

    it("prefers request baseUrl over the client's", async () => {
        let scoped = createFetch({ fetch: fetch_, baseUrl: "https://base.com" })
        await scoped("/path", { baseUrl: "https://override.com" })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://override.com/path")
    })

    it("passes extra RequestInit through", async () => {
        await client("https://example.com", { extra: { signal: new AbortController().signal } })
        expect((fetch_.mock.calls[0][0] as Request).signal).toBeInstanceOf(AbortSignal)
    })

    it("serializes json and defaults method to POST", async () => {
        await client("https://example.com", { json: { hello: "world" } })
        let req = fetch_.mock.calls[0][0] as Request
        expect(req.method).toBe("POST")
        expect(req.headers.get("Content-Type")).toBe("application/json")
        expect(await req.json()).toEqual({ hello: "world" })
    })

    it("throws when both json and body are set", async () => {
        expect(() => client("https://example.com", { json: {}, body: "x" })).toThrow("Cannot set both json and body.")
    })

    it("merges headers from base options, extend(), and the request", async () => {
        let scoped = createFetch({ fetch: fetch_, headers: [["X-Header", "value"]] }).extend({
            headers: [["X-Header-2", "value2"]],
        })
        await scoped("https://example.com", { headers: [["X-header-3", "value3"]] })
        expect(Object.fromEntries((fetch_.mock.calls[0][0] as Request).headers.entries())).toEqual({
            "x-header": "value",
            "x-header-2": "value2",
            "x-header-3": "value3",
        })
    })

    it(".json / .arrayBuffer / .blob / .bytes / .stream set Accept and parse", async () => {
        fetch_.mockImplementation(async () => new Response('{"hello":"world"}'))
        expect(await client("https://example.com").json()).toEqual({ hello: "world" })
        expect((fetch_.mock.calls[0][0] as Request).headers.get("Accept")).toBe("application/json")

        fetch_.mockImplementation(async () => new Response("hello"))
        let buf = await client("https://example.com").arrayBuffer()
        expect(new Uint8Array(buf)).toEqual(new Uint8Array([104, 101, 108, 108, 111]))
        expect((fetch_.mock.calls[1][0] as Request).headers.get("Accept")).toBe("application/octet-stream")

        expect(await (await client("https://example.com").blob()).text()).toBe("hello")
        expect(await client("https://example.com").bytes()).toEqual(new Uint8Array([104, 101, 108, 108, 111]))

        let stream = await client("https://example.com").stream()
        let reader = stream.getReader()
        expect(await reader.read()).toEqual({ value: new Uint8Array([104, 101, 108, 108, 111]), done: false })
        expect((await reader.read()).done).toBe(true)
    })

    it("runs middlewares and addons", async () => {
        let mw: FetchMiddleware = async (req, next) => {
            req.headers.set("X-Req", "1")
            let res = await next(req)
            return new Response(`uwu (orig: ${await res.text()})`)
        }
        let addon: FetchAddon<object, object> = {
            beforeRequest: (ctx) => {
                ctx.url = "https://example2.com"
                ctx.options.method = "POST"
            },
        }
        let scoped = createFetch({ fetch: fetch_, middlewares: [mw], addons: [addon] })
        let res = await scoped("https://example.com")
        let req = fetch_.mock.calls[0][0] as Request
        expect(req.url).toBe("https://example2.com/")
        expect(req.method).toBe("POST")
        expect(req.headers.get("X-Req")).toBe("1")
        expect(await res.text()).toBe("uwu (orig: OK)")
    })

    it("throws HttpError on non-2xx unless validateResponse says otherwise", async () => {
        fetch_.mockImplementation(async () => new Response("Not OK", { status: 403 }))
        await expect(client("https://example.com")).rejects.toBeInstanceOf(HttpError)
        expect(await client("https://example.com", { validateResponse: false }).text()).toBe("Not OK")
        expect(await client("https://example.com", { validateResponse: () => true }).text()).toBe("Not OK")
        await expect(client("https://example.com", { validateResponse: () => false })).rejects.toBeInstanceOf(HttpError)
    })

    it("reads or skips the error body based on readBodyOnError", async () => {
        fetch_.mockImplementation(async () => new Response("Not OK", { status: 403 }))
        let withBody = await client("https://example.com", { readBodyOnError: true }).then(
            () => {
                throw new Error("expected throw")
            },
            (e) => e as HttpError,
        )
        expect(withBody.body).toEqual(new Uint8Array([78, 111, 116, 32, 79, 75]))
        expect(withBody.bodyText).toBe("Not OK")

        let without = await client("https://example.com", { readBodyOnError: false }).then(
            () => {
                throw new Error("expected throw")
            },
            (e) => e as HttpError,
        )
        expect(without.body).toBeNull()
        expect(without.bodyText).toBeNull()
    })

    it("maps errors via mapError", async () => {
        class MyError extends Error {}
        fetch_.mockImplementation(async () => new Response("Not OK", { status: 403 }))
        let scoped = createFetch({
            fetch: fetch_,
            mapError: (err) => (err.response.status === 403 ? new MyError("403") : err),
        })
        await expect(scoped("https://example.com")).rejects.toBeInstanceOf(MyError)
        fetch_.mockImplementation(async () => new Response("Not OK", { status: 404 }))
        await expect(scoped("https://example.com")).rejects.toBeInstanceOf(HttpError)
    })

    it("exposes method shorthands", async () => {
        await client.post("https://example.com")
        expect((fetch_.mock.calls[0][0] as Request).method).toBe("POST")
    })
})
