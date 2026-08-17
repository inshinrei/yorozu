import type { FetchLike } from "../types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFetch, HttpError } from "../client"
import { RetriesExceededError, retry } from "./retry"

let fetch_ = vi.fn<FetchLike>(async () => new Response("OK"))
let client = createFetch({
    fetch: fetch_,
    addons: [retry()],
    retry: { retryDelay: 10 },
})

describe("retry addon", () => {
    beforeEach(() => {
        fetch_.mockClear()
        fetch_.mockImplementation(async () => new Response("OK"))
    })

    it("retries on 500 then succeeds", async () => {
        let n = 0
        fetch_.mockImplementation(async () =>
            n++ < 2 ? new Response(null, { status: 500 }) : new Response("OK!", { status: 200 }),
        )
        let res = await client("https://example.com")
        expect(fetch_).toHaveBeenCalledTimes(3)
        expect(await res.text()).toBe("OK!")
    })

    it("stops after maxRetries and throws RetriesExceededError", async () => {
        fetch_.mockImplementation(async () => new Response(null, { status: 500 }))
        await expect(client("https://example.com", { retry: { maxRetries: 3 } })).rejects.toBeInstanceOf(
            RetriesExceededError,
        )
        expect(fetch_).toHaveBeenCalledTimes(4)
    })

    it("returns the last response when returnLastResponse is true", async () => {
        fetch_.mockImplementation(async () => new Response("still failing", { status: 503 }))
        let res = await client("https://example.com", {
            validateResponse: false,
            retry: { maxRetries: 1, retryDelay: 0, returnLastResponse: true },
        })
        expect(res.status).toBe(503)
        expect(await res.text()).toBe("still failing")
    })

    it("retries a POST body by cloning the request", async () => {
        let bodies: string[] = []
        fetch_.mockImplementation(async (req) => {
            bodies.push(await req.text())
            return bodies.length < 2 ? new Response(null, { status: 500 }) : new Response("OK")
        })
        let res = await client("https://example.com", {
            method: "POST",
            body: "payload",
            retry: { maxRetries: 2, retryDelay: 0 },
        })
        expect(bodies).toEqual(["payload", "payload"])
        expect(res.status).toBe(200)
    })

    it("honors onResponse and onError, skip, and retry: false", async () => {
        fetch_.mockImplementation(async () => new Response("Bad request", { status: 400 }))
        await expect(
            client("https://example.com", { retry: { onResponse: (res) => res.status !== 500 } }),
        ).rejects.toBeInstanceOf(HttpError)

        fetch_.mockImplementation(async () => {
            throw new Error("boom")
        })
        await expect(client("https://example.com", { retry: { onError: () => false, retryDelay: 0 } })).rejects.toThrow(
            "boom",
        )

        fetch_.mockClear()
        fetch_.mockImplementation(async () => new Response(null, { status: 500 }))
        await expect(
            createFetch({ fetch: fetch_, addons: [retry()], retry: { maxRetries: 2, retryDelay: 0 } })(
                "https://example.com",
                { retry: false },
            ),
        ).rejects.toBeInstanceOf(HttpError)
        expect(fetch_).toHaveBeenCalledTimes(1)
    })
})
