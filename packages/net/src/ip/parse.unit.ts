import { describe, expect, it } from "vitest"
import { parse, parseWithPort, stringify, stringifyWithPort } from "./parse"
import { Ipv4Address, Ipv6Address } from "./types"

describe("IP address dispatcher (parse / stringify)", () => {
    describe("parse", () => {
        it("routes IPv4 to parseV4", () => {
            let result = parse("192.168.1.1")
            expect(result.type).toBe("ipv4")
            expect(result.parts).toEqual(new Uint8Array([192, 168, 1, 1]))
        })

        it("routes IPv6 to parseV6", () => {
            let result = parse("2001:db8::1")
            expect(result.type).toBe("ipv6")
            expect(result.parts).toEqual(new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]))
        })

        it("handles IPv6 with zone ID", () => {
            let result = parse("fe80::1%eth0")
            expect(result.type).toBe("ipv6")
            expect((result as Ipv6Address).zoneId).toBe("eth0")
        })

        it("handles bracketed IPv6", () => {
            let result = parse("[2001:db8::1]")
            expect(result.type).toBe("ipv6")
        })

        it.todo("throws on invalid input", () => {
            expect(() => parse("")).toThrow()
            expect(() => parse("256.256.256.256")).toThrow()
            expect(() => parse("1:2:3:4:5:6:7:8:9")).toThrow()
        })
    })

    describe("parseWithPort", () => {
        it("parses IPv4 with port", () => {
            let [addr, port] = parseWithPort("192.168.1.1:8080")
            expect(addr.type).toBe("ipv4")
            expect(port).toBe(8080)
        })

        it("parses bracketed IPv6 with port (standard format)", () => {
            let [addr, port] = parseWithPort("[2001:db8::1]:443")
            expect(addr.type).toBe("ipv6")
            expect(port).toBe(443)
        })

        it("parses plain IPv6 with port (legacy non-bracketed)", () => {
            let [addr, port] = parseWithPort("2001:db8::1:443")
            expect(addr.type).toBe("ipv6")
            expect(port).toBe(443)
        })

        it("throws on invalid port", () => {
            expect(() => parseWithPort("192.168.1.1:70000")).toThrow("Invalid port")
            expect(() => parseWithPort("192.168.1.1:abc")).toThrow("Invalid port")
            expect(() => parseWithPort("[2001:db8::1]:abc")).toThrow("Invalid port")
        })

        it.todo("throws on malformed bracketed form", () => {
            expect(() => parseWithPort("[2001:db8::1:443")).toThrow("Invalid address with port")
            expect(() => parseWithPort("2001:db8::1]:443")).toThrow("Invalid address with port")
        })
    })

    describe("stringify", () => {
        it("stringifies IPv4", () => {
            let ipv4: Ipv4Address = { type: "ipv4", parts: new Uint8Array([192, 168, 1, 1]) }
            expect(stringify(ipv4)).toBe("192.168.1.1")
        })

        it("stringifies IPv6", () => {
            let ipv6: Ipv6Address = {
                type: "ipv6",
                parts: new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]),
            }
            expect(stringify(ipv6)).toBe("2001:db8::1")
        })
    })

    describe("stringifyWithPort", () => {
        it("adds port to IPv4", () => {
            let ipv4: Ipv4Address = { type: "ipv4", parts: new Uint8Array([192, 168, 1, 1]) }
            expect(stringifyWithPort(ipv4, 8080)).toBe("192.168.1.1:8080")
        })

        it("adds port to IPv6 with brackets (standard format)", () => {
            let ipv6: Ipv6Address = {
                type: "ipv6",
                parts: new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]),
            }
            expect(stringifyWithPort(ipv6, 443)).toBe("[2001:db8::1]:443")
        })

        it("preserves zone ID with brackets", () => {
            let ipv6: Ipv6Address = {
                type: "ipv6",
                parts: new Uint16Array([0xfe80, 0, 0, 0, 0, 0, 0, 1]),
                zoneId: "eth0",
            }
            expect(stringifyWithPort(ipv6, 3000)).toBe("[fe80::1%eth0]:3000")
        })
    })

    describe("round-trip safety", () => {
        let cases = ["192.168.1.1", "8.8.8.8", "2001:db8::1", "fe80::1%eth0", "::1"]

        for (let addr of cases) {
            it.todo(`parse → stringify → parse round-trips ${addr}`, () => {
                let parsed = parse(addr)
                let str = stringify(parsed)
                let reparsed = parse(str)
                expect(reparsed.type).toBe(parsed.type)
                if (parsed.type === "ipv4") {
                    expect((reparsed as Ipv4Address).parts).toEqual((parsed as Ipv4Address).parts)
                } else {
                    expect((reparsed as Ipv6Address).parts).toEqual((parsed as Ipv6Address).parts)
                }
            })
        }
    })
})
