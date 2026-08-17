import type { FetchLike } from "../types"
import { CookieJar } from "tough-cookie"
import { describe, expect, it, vi } from "vitest"
import { createFetch } from "../client"
import { toughCookieAddon } from "./tough-cookie"

describe("toughCookieAddon", () => {
    it("sends only cookies that match the request url", async () => {
        let fetch_ = vi.fn<FetchLike>(async () => new Response("OK"))
        let jar = new CookieJar()
        jar.setCookieSync("hello=world", "https://example.com")
        jar.setCookieSync("foo=bar", "https://example.com")
        jar.setCookieSync("goodbye=world", "https://not.example.com")

        let client = createFetch({ fetch: fetch_, addons: [toughCookieAddon()], cookies: jar })
        await client("https://example.com")
        expect((fetch_.mock.calls[0][0] as Request).headers.get("Cookie")).toBe("hello=world; foo=bar")
    })

    it("does not append an empty Cookie header", async () => {
        let fetch_ = vi.fn<FetchLike>(async () => new Response("OK"))
        let jar = new CookieJar()
        let client = createFetch({ fetch: fetch_, addons: [toughCookieAddon()], cookies: jar })
        await client("https://example.com")
        expect((fetch_.mock.calls[0][0] as Request).headers.has("Cookie")).toBe(false)
    })

    it("stores Set-Cookie back into the jar", async () => {
        let fetch_ = vi.fn<FetchLike>(async () => {
            let res = new Response("OK", { headers: { "Set-Cookie": "hello=world" } })
            Object.defineProperty(res, "url", { value: "https://example.com" })
            return res
        })
        let jar = new CookieJar()
        let client = createFetch({ fetch: fetch_, addons: [toughCookieAddon()], cookies: { jar } })
        await client("https://example.com")
        expect(await jar.getCookieString("https://example.com")).toBe("hello=world")
    })
})
