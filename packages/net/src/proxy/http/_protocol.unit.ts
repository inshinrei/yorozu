import { describe, expect, it } from "vitest"
import { buildConnectRequest } from "./_protocol"
import type { HttpProxySettings } from "./types"
import type { TCPEndpoint } from "../../types"
import { utf8 } from "@yorozu/utils"

describe("buildConnectRequest", () => {
    function decode(buf: Uint8Array): string {
        return utf8.decoder.decode(buf)
    }

    let dest: TCPEndpoint = { address: "example.com", port: 443 }

    it("builds basic CONNECT request", () => {
        let settings: HttpProxySettings = { host: "proxy", port: 8080 }
        let req = buildConnectRequest(settings, dest)
        let text = decode(req)

        expect(text).toContain("CONNECT example.com:443 HTTP/1.1")
        expect(text).toContain("Host: example.com:443")
        expect(text).toContain("User-Agent: @yorozu/net")
        expect(text).toContain("Proxy-Connection: Keep-Alive")
        expect(text.endsWith("\r\n\r\n")).toBe(true)
    })

    it("wraps IPv6 address in brackets", () => {
        let ipv6: TCPEndpoint = { address: "2001:db8::1", port: 443 }
        let settings: HttpProxySettings = { host: "proxy", port: 8080 }
        let req = buildConnectRequest(settings, ipv6)
        let text = decode(req)

        expect(text).toContain("CONNECT [2001:db8::1]:443 HTTP/1.1")
        expect(text).toContain("Host: [2001:db8::1]:443")
    })

    it("adds Proxy-Authorization when user/password provided", () => {
        let settings: HttpProxySettings = {
            host: "proxy",
            port: 8080,
            user: "user",
            password: "pass",
        }
        let req = buildConnectRequest(settings, dest)
        let text = decode(req)

        expect(text).toContain("Proxy-Authorization: Basic ")
        expect(text).toContain("dXNlcjpwYXNz")
    })

    it("adds custom headers", () => {
        let settings: HttpProxySettings = {
            host: "proxy",
            port: 8080,
            headers: { "X-Custom": "value", "Proxy-Authorization": "Bearer token" },
        }
        let req = buildConnectRequest(settings, dest)
        let text = decode(req)

        expect(text).toContain("X-Custom: value")
        expect(text).toContain("Proxy-Authorization: Bearer token")
    })
})
