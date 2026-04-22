import { describe, expect, it } from "vitest"
import { normalizeV4, parseV4, stringifyV4 } from "./v4"
import { Ipv4Address } from "./types"

describe("IPv4 parser (strict modern)", () => {
    describe("parseV4", () => {
        it("parses full 4-octet address", () => {
            let ip = parseV4("192.168.1.1")
            expect(ip.type).toBe("ipv4")
            expect(ip.parts).toEqual(new Uint8Array([192, 168, 1, 1]))
        })

        it("parses 32-bit integer form", () => {
            let ip = parseV4("3232235777")
            expect(ip.parts).toEqual(new Uint8Array([192, 168, 1, 1]))
        })

        it("rejects 2-octet shorthand (legacy behaviour removed)", () => {
            expect(() => parseV4("192.168")).toThrow(RangeError)
            expect(() => parseV4("192.168")).toThrow("Invalid IPv4 address")
        })

        it("rejects 3-octet shorthand (legacy behaviour removed)", () => {
            expect(() => parseV4("192.168.1")).toThrow(RangeError)
        })

        it("rejects more than 4 octets", () => {
            expect(() => parseV4("1.2.3.4.5")).toThrow(RangeError)
        })

        it("rejects invalid octet values", () => {
            expect(() => parseV4("256.0.0.1")).toThrow(RangeError)
            expect(() => parseV4("1.2.3.-1")).toThrow(RangeError)
            expect(() => parseV4("1.2.foo.4")).toThrow(RangeError)
        })

        it.todo("rejects empty / malformed input", () => {
            expect(() => parseV4("")).toThrow(RangeError)
            expect(() => parseV4("...")).toThrow(RangeError)
            expect(() => parseV4("1.2.")).toThrow(RangeError)
        })
    })

    describe("stringifyV4", () => {
        it("converts Ipv4Address back to dotted string", () => {
            let ip: Ipv4Address = { type: "ipv4", parts: new Uint8Array([192, 168, 1, 1]) }
            expect(stringifyV4(ip)).toBe("192.168.1.1")
        })

        it("throws on invalid parts length", () => {
            let bad: any = { type: "ipv4", parts: new Uint8Array([1, 2, 3]) }
            expect(() => stringifyV4(bad)).toThrow(RangeError)
        })
    })

    describe("normalizeV4", () => {
        it("round-trips valid addresses to canonical form", () => {
            expect(normalizeV4("192.168.1.1")).toBe("192.168.1.1")
            expect(normalizeV4("3232235777")).toBe("192.168.1.1")
        })

        it("throws on invalid input (same as parseV4)", () => {
            expect(() => normalizeV4("192.168")).toThrow(RangeError)
            expect(() => normalizeV4("256.0.0.1")).toThrow(RangeError)
        })
    })

    describe("buffer reuse safety", () => {
        it("parseV4 always returns a fresh buffer", () => {
            let a = parseV4("1.2.3.4").parts
            let b = parseV4("5.6.7.8").parts
            expect(a).not.toBe(b)
            a[0] = 99
            expect(b[0]).toBe(5)
        })
    })
})
