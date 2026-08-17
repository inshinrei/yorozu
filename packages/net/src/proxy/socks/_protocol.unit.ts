import { describe, expect, it } from "vitest"
import type { TCPEndpoint } from "../../types"
import {
    buildSocks4Connect,
    buildSocks5Auth,
    buildSocks5Connect,
    buildSocks5Greeting,
    Socks4Errors,
    Socks5Errors,
} from "./_protocol"

// Expert Mode (Senior SWE):
// Binary protocol builders demand byte-exact assertions against RFC 1928/1929.
// Pre-calc length + fixed allocation in buildSocks4Connect is fragile (off-by-one on null terminators).
// This is inefficient and non-rebellious — better would be a streaming writer or u8.push pattern from @yorozu/io.
// Tests below expose any mismatch while remaining production-ready and fast.
// Prefer let everywhere except arrow helpers and vitest globals.

describe("SOCKS Protocol Builders", () => {
    let toU8 = (bytes: number[]): Uint8Array => new Uint8Array(bytes)

    it("exposes static error maps", () => {
        expect(Socks4Errors[91]).toBe("Request rejected or failed")
        expect(Socks5Errors[5]).toBe("Connection refused by destination host")
    })

    describe("buildSocks4Connect", () => {
        it("builds IPv4 connect with username", () => {
            let dest: TCPEndpoint = { address: "192.168.1.1", port: 8080 }
            let result = buildSocks4Connect(dest, "test")
            let expected = toU8([0x04, 0x01, 0x1f, 0x90, 0xc0, 0xa8, 0x01, 0x01, 0x74, 0x65, 0x73, 0x74, 0x00])
            expect(result).toEqual(expected)
        })

        it("builds hostname (SOCKS4a) with empty user", () => {
            let dest: TCPEndpoint = { address: "example.com", port: 80 }
            let result = buildSocks4Connect(dest, "")
            let hostBytes = Array.from(new TextEncoder().encode("example.com"))
            let expected = toU8([0x04, 0x01, 0x00, 0x50, 0x00, 0x00, 0x00, 0x2a, 0x00, ...hostBytes, 0x00])
            expect(result).toEqual(expected)
        })
    })

    describe("buildSocks5Greeting", () => {
        it("builds no-auth greeting", () => {
            let result = buildSocks5Greeting(false)
            let expected = toU8([0x05, 0x01, 0x00])
            expect(result).toEqual(expected)
        })

        it("builds greeting with username/password auth", () => {
            let result = buildSocks5Greeting(true)
            let expected = toU8([0x05, 0x02, 0x00, 0x02])
            expect(result).toEqual(expected)
        })
    })

    describe("buildSocks5Auth", () => {
        it("builds username/password request", () => {
            let result = buildSocks5Auth("user", "pass")
            let expected = toU8([0x01, 0x04, 0x75, 0x73, 0x65, 0x72, 0x04, 0x70, 0x61, 0x73, 0x73])
            expect(result).toEqual(expected)
        })

        it("rejects oversized credentials", () => {
            let long = "a".repeat(256)
            expect(() => buildSocks5Auth(long, "p")).toThrow(TypeError)
            expect(() => buildSocks5Auth("u", long)).toThrow(TypeError)
        })
    })

    describe("buildSocks5Connect", () => {
        it("builds IPv4 connect", () => {
            let dest: TCPEndpoint = { address: "8.8.8.8", port: 53 }
            let result = buildSocks5Connect(dest)
            let expected = toU8([0x05, 0x01, 0x00, 0x01, 0x08, 0x08, 0x08, 0x08, 0x00, 0x35])
            expect(result).toEqual(expected)
        })

        it("builds IPv6 connect", () => {
            let dest: TCPEndpoint = { address: "2001:db8::1", port: 80 }
            let result = buildSocks5Connect(dest)
            let ipv6Bytes = [
                0x20, 0x01, 0x0d, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
            ]
            let expected = toU8([0x05, 0x01, 0x00, 0x04, ...ipv6Bytes, 0x00, 0x50])
            expect(result).toEqual(expected)
        })

        it("builds domain-name connect", () => {
            let dest: TCPEndpoint = { address: "google.com", port: 443 }
            let result = buildSocks5Connect(dest)
            let nameBytes = Array.from(new TextEncoder().encode("google.com"))
            let expected = toU8([0x05, 0x01, 0x00, 0x03, nameBytes.length, ...nameBytes, 0x01, 0xbb])
            expect(result).toEqual(expected)
        })

        it("rejects oversized hostname", () => {
            let dest: TCPEndpoint = { address: "a".repeat(300), port: 80 }
            expect(() => buildSocks5Connect(dest)).toThrow(TypeError)
        })
    })
})
