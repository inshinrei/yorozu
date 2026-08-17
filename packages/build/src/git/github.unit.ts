import { afterEach, describe, expect, it, vi } from "vitest"
import { createGithubRelease } from "./github"

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    })
}

function textResponse(status: number, body: string): Response {
    return new Response(body, { status })
}

describe("createGithubRelease", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("returns the release id when there are no artifacts", async () => {
        let fetchMock = vi.fn().mockResolvedValueOnce(
            jsonResponse(201, { id: 42, upload_url: "https://uploads.example/assets{?name,label}" }),
        )
        vi.stubGlobal("fetch", fetchMock)

        let id = await createGithubRelease({
            token: "tok",
            repo: "acme/app",
            tag: "v1.0.0",
            name: "v1.0.0",
            body: "notes",
            apiUrl: "https://api.example",
        })

        expect(id).toBe(42)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("throws when an artifact upload fails after the release is created", async () => {
        let fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse(201, { id: 7, upload_url: "https://uploads.example/assets{?name,label}" }),
            )
            .mockResolvedValueOnce(textResponse(500, "disk full"))
        vi.stubGlobal("fetch", fetchMock)

        await expect(
            createGithubRelease({
                token: "tok",
                repo: "acme/app",
                tag: "v1.0.0",
                name: "v1.0.0",
                body: "notes",
                apiUrl: "https://api.example",
                artifacts: [{ name: "pkg.tgz", type: "application/gzip", body: new Uint8Array([1, 2, 3]) }],
            }),
        ).rejects.toThrow("failed to upload artifact: pkg.tgz")

        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
