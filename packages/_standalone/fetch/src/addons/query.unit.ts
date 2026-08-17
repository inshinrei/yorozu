import type { FetchLike } from "../types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFetch } from "../client"
import { query } from "./query"

let fetch_ = vi.fn<FetchLike>(async () => new Response("OK"))
let client = createFetch({ fetch: fetch_, addons: [query()] })

describe("query addon", () => {
    beforeEach(() => {
        fetch_.mockClear()
    })

    it("passes query params", async () => {
        let res = await client("https://example.com", { query: { foo: "bar" } })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/?foo=bar")
        expect(await res.text()).toBe("OK")
    })

    it("handles multiple query params and arrays", async () => {
        await client("https://example.com", { query: { foo: "bar", baz: ["qux", "quux"] } })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/?foo=bar&baz=qux&baz=quux")
    })

    it("skips nullish query params", async () => {
        await client("https://example.com", { query: { foo: "bar", baz: null, qux: undefined } })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/?foo=bar")
    })

    it("merges query params with the ones in the URL", async () => {
        await client("https://example.com?foo=bar", { query: { baz: ["qux", "quux"] } })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/?foo=bar&baz=qux&baz=quux")
    })

    it("does not override query params already in the URL", async () => {
        await client("https://example.com?foo=bar", { query: { foo: "baz" } })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/?foo=bar&foo=baz")
    })

    it("merges base query with request query (request wins)", async () => {
        let scoped = createFetch({
            fetch: fetch_,
            addons: [query()],
            query: { foo: "bar" },
        })
        await scoped("https://example.com/path", { query: { foo: "baz", baz: ["qux", "quux"] } })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/path?foo=baz&baz=qux&baz=quux")
    })

    it("uses a custom serialize function", async () => {
        let scoped = createFetch({
            fetch: fetch_,
            addons: [query({ serialize: (q, url) => `${url}?custom=${Object.keys(q).join(",")}` })],
        })
        await scoped("https://example.com", { query: { a: 1 } })
        expect((fetch_.mock.calls[0][0] as Request).url).toBe("https://example.com/?custom=a")
    })
})
