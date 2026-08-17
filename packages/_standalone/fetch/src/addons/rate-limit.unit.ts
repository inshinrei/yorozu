import type { FetchLike } from "../types"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createFetch } from "../client"
import { rateLimitHandler } from "./rate-limit"

describe("rateLimitHandler", () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it("retries 429 then succeeds", async () => {
        let times = 0
        let fetch_ = vi.fn<FetchLike>(async () => {
            switch (times++) {
                case 0:
                case 1:
                    return new Response(null, { status: 429, headers: { "X-RateLimit-Reset": "0" } })
                default:
                    return new Response("OK")
            }
        })

        let client = createFetch({
            fetch: fetch_,
            addons: [rateLimitHandler()],
            rateLimit: { defaultWaitTime: 0, jitter: 0 },
        })

        expect(await client("https://example.com").text()).toBe("OK")
        expect(fetch_).toHaveBeenCalledTimes(3)
    })

    it("uses isRejected", async () => {
        let times = 0
        let fetch_ = vi.fn<FetchLike>(async () => {
            switch (times++) {
                case 0:
                case 1:
                    return new Response(null, { status: 599, headers: { "X-RateLimit-Reset": "0" } })
                default:
                    return new Response("OK")
            }
        })

        let client = createFetch({
            fetch: fetch_,
            addons: [rateLimitHandler()],
            rateLimit: { isRejected: (res) => res.status === 599, defaultWaitTime: 0, jitter: 0 },
        })

        expect(await client("https://example.com").text()).toBe("OK")
        expect(fetch_).toHaveBeenCalledTimes(3)
    })

    it("uses getReset and waits that many ms", async () => {
        vi.setSystemTime(0)
        let times = 0
        let fetch_ = vi.fn<FetchLike>(async () => {
            switch (times++) {
                case 0:
                case 1:
                    return new Response(null, { status: 429 })
                default:
                    return new Response("OK")
            }
        })
        let setTimeout_ = vi.spyOn(globalThis, "setTimeout")

        let client = createFetch({
            fetch: fetch_,
            addons: [rateLimitHandler()],
            rateLimit: { getReset: () => 0.1, defaultWaitTime: 0, jitter: 0 },
        })

        expect(await client("https://example.com").text()).toBe("OK")
        expect(fetch_).toHaveBeenCalledTimes(3)
        expect(setTimeout_).toHaveBeenCalledTimes(2)
        expect(setTimeout_).toHaveBeenNthCalledWith(1, expect.any(Function), 100)
        expect(setTimeout_).toHaveBeenNthCalledWith(2, expect.any(Function), 100)
    })

    it("waits defaultWaitTime when getReset returns null", async () => {
        let times = 0
        let fetch_ = vi.fn<FetchLike>(async () => {
            switch (times++) {
                case 0:
                case 1:
                    return new Response(null, { status: 429 })
                default:
                    return new Response("OK")
            }
        })
        let setTimeout_ = vi.spyOn(globalThis, "setTimeout")

        let client = createFetch({
            fetch: fetch_,
            addons: [rateLimitHandler()],
            rateLimit: { getReset: () => null, defaultWaitTime: 100, jitter: 0 },
        })

        expect(await client("https://example.com").text()).toBe("OK")
        expect(fetch_).toHaveBeenCalledTimes(3)
        expect(setTimeout_).toHaveBeenNthCalledWith(1, expect.any(Function), 100)
        expect(setTimeout_).toHaveBeenNthCalledWith(2, expect.any(Function), 100)
    })

    it("adds jitter to the wait time", async () => {
        vi.setSystemTime(0)
        let times = 0
        let fetch_ = vi.fn<FetchLike>(async () => {
            switch (times++) {
                case 0:
                case 1:
                    return new Response(null, { status: 429 })
                default:
                    return new Response("OK")
            }
        })
        let setTimeout_ = vi.spyOn(globalThis, "setTimeout")

        let client = createFetch({
            fetch: fetch_,
            addons: [rateLimitHandler()],
            rateLimit: { getReset: () => 0.1, jitter: 5 },
        })

        expect(await client("https://example.com").text()).toBe("OK")
        expect(setTimeout_).toHaveBeenNthCalledWith(1, expect.any(Function), 105)
        expect(setTimeout_).toHaveBeenNthCalledWith(2, expect.any(Function), 105)
    })

    it("throws if reset time is too far in the future", async () => {
        vi.setSystemTime(0)
        let fetch_ = vi.fn<FetchLike>(async () => new Response(null, { status: 429 }))

        let client = createFetch({
            fetch: fetch_,
            addons: [rateLimitHandler()],
            rateLimit: { getReset: () => 10, maxWaitTime: 1000 },
        })

        await expect(client("https://example.com")).rejects.toThrow("Rate limit exceeded")
    })
})
