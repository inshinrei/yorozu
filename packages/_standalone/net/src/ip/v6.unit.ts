import { beforeEach, describe, expect, it, vi } from "vitest"
import { expandV6, fromBytesV6, parseV6, readV6, stringifyV6, toBytesV6, writeV6 } from "./v6"
import { typed } from "@yorozu/utils"
import { Ipv6Address } from "./types"

let mockReader: any
let mockWriter: any

beforeEach(() => {
    mockReader = {
        readSync: vi.fn(),
    }
    mockWriter = {
        writeSync: vi.fn(),
        disposeWriteSync: vi.fn(),
    }
})

describe.todo("IPv6 parser & stringifier", () => {
    describe("parseV6", () => {
        it("parses full 8-part address", () => {
            let ip = parseV6("2001:db8:85a3:8d3:1319:8a2e:370:7348")
            expect(ip.type).toBe("ipv6")
            expect(ip.parts).toEqual(new Uint16Array([0x2001, 0xdb8, 0x85a3, 0x8d3, 0x1319, 0x8a2e, 0x370, 0x7348]))
            expect(ip.zoneId).toBeUndefined()
        })

        it("parses compressed address with ::", () => {
            let ip = parseV6("2001:db8::1")
            expect(ip.parts).toEqual(new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]))
        })

        it("parses leading ::", () => {
            let ip = parseV6("::1")
            expect(ip.parts).toEqual(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 1]))
        })

        it("parses trailing ::", () => {
            let ip = parseV6("2001:db8::")
            expect(ip.parts).toEqual(new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]))
        })

        it("parses IPv4-mapped address", () => {
            let ip = parseV6("::ffff:192.168.1.1")
            expect(ip.parts).toEqual(new Uint16Array([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]))
        })

        it("parses zone ID", () => {
            let ip = parseV6("fe80::1%eth0")
            expect(ip.zoneId).toBe("eth0")
            expect(ip.parts[0]).toBe(0xfe80)
        })

        it("parses bracketed form", () => {
            let ip = parseV6("[2001:db8::1]")
            expect(ip.parts).toEqual(new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]))
        })

        it("parses bracketed with zone ID", () => {
            let ip = parseV6("[fe80::1%eth0]")
            expect(ip.zoneId).toBe("eth0")
        })

        it("rejects multiple double colons", () => {
            expect(() => parseV6("2001:db8::1::2")).toThrow("Invalid IPv6 address (multiple double colons)")
        })

        it("rejects colon at start without ::", () => {
            expect(() => parseV6(":2001:db8::1")).toThrow("Invalid IPv6 address (colon at the beginning)")
        })

        it("rejects too many parts", () => {
            expect(() => parseV6("1:2:3:4:5:6:7:8:9")).toThrow("too many parts")
        })

        it("rejects too few parts without compression", () => {
            expect(() => parseV6("1:2:3:4")).toThrow("too few parts")
        })

        it("rejects invalid hex part", () => {
            expect(() => parseV6("2001:db8:gggg::1")).toThrow("Invalid IPv6 part")
        })
    })

    describe("stringifyV6", () => {
        let ip: Ipv6Address = {
            type: "ipv6",
            parts: new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]),
        }

        it("compresses zeros by default", () => {
            expect(stringifyV6(ip)).toBe("2001:db8::1")
        })

        it("respects zeroCompression: false", () => {
            expect(stringifyV6(ip, { zeroCompression: false })).toBe("2001:db8:0:0:0:0:0:1")
        })

        it("respects fixedLength: true", () => {
            expect(stringifyV6(ip, { fixedLength: true })).toBe("2001:0db8:0000:0000:0000:0000:0000:0001")
        })

        it("appends zone ID", () => {
            let zoned: Ipv6Address = { ...ip, zoneId: "eth0" }
            expect(stringifyV6(zoned)).toBe("2001:db8::1%eth0")
        })
    })

    describe("expandV6", () => {
        it("expands compressed address", () => {
            expect(expandV6("2001:db8::1")).toBe("2001:db8:0:0:0:0:0:1")
        })
    })

    describe("byte conversion", () => {
        let ip: Ipv6Address = {
            type: "ipv6",
            parts: new Uint16Array([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]),
        }

        beforeEach(() => {
            vi.spyOn(typed, "getPlatformByteOrder").mockReturnValue("big")
        })

        it("fromBytesV6 / toBytesV6 round-trip (big-endian)", () => {
            let bytes = toBytesV6(ip)
            expect(bytes).toEqual(new Uint8Array([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]))

            let parsed = fromBytesV6(bytes)
            expect(parsed.parts).toEqual(ip.parts)
        })

        it("fromBytesV6 / toBytesV6 round-trip (little-endian)", () => {
            vi.spyOn(typed, "getPlatformByteOrder").mockReturnValue("little")

            let bytes = toBytesV6(ip)
            let parsed = fromBytesV6(bytes)
            expect(parsed.parts).toEqual(ip.parts)
        })

        it("readV6 / writeV6 round-trip", () => {
            let bytes = toBytesV6(ip)
            mockReader.readSync.mockReturnValueOnce(bytes)

            let parsed = readV6(mockReader)
            expect(parsed.parts).toEqual(ip.parts)

            writeV6(ip, mockWriter)
            expect(mockWriter.writeSync).toHaveBeenCalledWith(16)
            expect(mockWriter.disposeWriteSync).toHaveBeenCalled()
        })

        it("fromBytesV6 throws on wrong length", () => {
            expect(() => fromBytesV6(new Uint8Array(15))).toThrow("Invalid IPv6 address buffer")
        })
    })

    describe("round-trip safety", () => {
        let cases = [
            "::1",
            "2001:db8::1",
            "fe80::1%eth0",
            "[2001:db8::1]",
            "::ffff:192.168.1.1",
            "2001:db8:85a3:8d3:1319:8a2e:370:7348",
        ]

        for (let c of cases) {
            it(`parseV6 → stringifyV6 → parseV6 round-trips: ${c}`, () => {
                let parsed = parseV6(c)
                let str = stringifyV6(parsed)
                let reparsed = parseV6(str)
                expect(reparsed.parts).toEqual(parsed.parts)
                expect(reparsed.zoneId).toBe(parsed.zoneId)
            })
        }
    })
})
