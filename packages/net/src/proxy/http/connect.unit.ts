import { beforeEach, describe, expect, it, vi } from "vitest"
import { performHttpProxyHandshake } from "./connect"
import { read } from "@yorozu/io"
import { buildConnectRequest } from "./_protocol"
import type { HttpProxySettings } from "./types"
import { HttpProxyConnectionError } from "./types"
import type { TCPEndpoint } from "../../types"
import { utf8 } from "@yorozu/utils"

vi.mock("@yorozu/io", () => ({
    read: {
        async: {
            exactly: vi.fn(),
        },
    },
}))

vi.mock("./_protocol", () => ({
    buildConnectRequest: vi.fn(),
}))

describe("performHttpProxyHandshake", () => {
    let mockWriter: any
    let mockExactly: any
    let proxy: HttpProxySettings
    let destination: TCPEndpoint

    beforeEach(() => {
        mockWriter = { write: vi.fn().mockResolvedValue(undefined) }
        mockExactly = vi.mocked(read.async.exactly)
        proxy = { host: "proxy.example.com", port: 8080 } as HttpProxySettings
        destination = { host: "target.example.com", port: 443, address: "" } as TCPEndpoint
        vi.clearAllMocks()
    })

    it("writes CONNECT request and succeeds with HTTP/1.1 200", async () => {
        let connectReq = new Uint8Array([67, 79, 78, 78, 69, 67, 84])
        vi.mocked(buildConnectRequest).mockReturnValue(connectReq)

        let status = utf8.encoder.encode("HTTP/1.1 200")

        mockExactly.mockResolvedValueOnce(status)
        mockExactly.mockResolvedValueOnce(new Uint8Array([13]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([10]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([13]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([10]))

        await performHttpProxyHandshake({} as any, mockWriter, proxy, destination)

        expect(buildConnectRequest).toHaveBeenCalledWith(proxy, destination)
        expect(mockWriter.write).toHaveBeenCalledWith(connectReq)
        expect(mockExactly).toHaveBeenCalledTimes(5)
    })

    it("succeeds with HTTP/1.0 200", async () => {
        let status = utf8.encoder.encode("HTTP/1.0 200")

        mockExactly.mockResolvedValueOnce(status)
        mockExactly.mockResolvedValueOnce(new Uint8Array([13]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([10]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([13]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([10]))

        await performHttpProxyHandshake({} as any, mockWriter, proxy, destination)
    })

    it("throws HttpProxyConnectionError on invalid status line", async () => {
        let badStatus = utf8.encoder.encode("HTTP/1.1 403")
        mockExactly.mockResolvedValueOnce(badStatus)

        await expect(performHttpProxyHandshake({} as any, mockWriter, proxy, destination)).rejects.toThrow(
            HttpProxyConnectionError,
        )
    })

    it("correctly detects \\r\\n\\r\\n when split across many 1-byte reads", async () => {
        let status = utf8.encoder.encode("HTTP/1.1 200")

        mockExactly.mockResolvedValueOnce(status)
        mockExactly.mockResolvedValueOnce(new Uint8Array([72])) // H
        mockExactly.mockResolvedValueOnce(new Uint8Array([111])) // o
        mockExactly.mockResolvedValueOnce(new Uint8Array([13]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([10]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([13]))
        mockExactly.mockResolvedValueOnce(new Uint8Array([10]))

        await performHttpProxyHandshake({} as any, mockWriter, proxy, destination)
    })
})
