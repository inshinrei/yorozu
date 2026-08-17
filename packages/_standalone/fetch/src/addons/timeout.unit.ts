import type { FetchLike } from "../types"
import { describe, expect, it, vi } from "vitest"
import { createFetch } from "../client"
import { timeout, TimeoutError } from "./timeout"

let fetch_ = vi.fn<FetchLike>((req) => {
    return new Promise((resolve, reject) => {
        let timer = setTimeout(() => resolve(new Response("OK")), 50)
        req.signal?.addEventListener("abort", () => {
            clearTimeout(timer)
            reject(req.signal?.reason)
        })
    })
})

let client = createFetch({ fetch: fetch_, addons: [timeout()] })

describe("timeout addon", () => {
    it("aborts with TimeoutError", async () => {
        await expect(client("https://example.com", { timeout: 10 })).rejects.toBeInstanceOf(TimeoutError)
    })

    it("inherits timeout from base options", async () => {
        let scoped = createFetch({ fetch: fetch_, addons: [timeout()], timeout: 10 })
        await expect(scoped("https://example.com")).rejects.toBeInstanceOf(TimeoutError)
    })

    it("disables the base timeout when Infinity or 0 is passed", async () => {
        let scoped = createFetch({ fetch: fetch_, addons: [timeout()], timeout: 10 })
        expect((await scoped("https://example.com", { timeout: Infinity })).status).toBe(200)
        expect((await scoped("https://example.com", { timeout: 0 })).status).toBe(200)
    })

    it("forwards an external abort reason", async () => {
        let controller = new AbortController()
        let err = new Error("uwu")
        let promise = client("https://example.com", { timeout: 100, extra: { signal: controller.signal } })
        setTimeout(() => controller.abort(err), 10)
        await expect(promise).rejects.toThrow(err)
    })
})
