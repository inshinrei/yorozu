import { describe, expect, it } from "vitest"
import { prettify, type PrettifyOptions } from "./prettify"

describe("prettify(address, options?)", () => {
    it("leaves hostnames and IPv4 unchanged", () => {
        expect(prettify("example.com")).toBe("example.com")
        expect(prettify("localhost")).toBe("localhost")
        expect(prettify("192.168.1.1")).toBe("192.168.1.1")
        expect(prettify("8.8.8.8:443")).toBe("8.8.8.8")
    })

    it("removes brackets from IPv6 by default", () => {
        expect(prettify("::1")).toBe("::1")
        expect(prettify("2001:db8::1")).toBe("2001:db8::1")
        expect(prettify("fe80::1%eth0")).toBe("fe80::1%eth0")
    })

    it.todo("adds brackets when encloseIpv6 = true", () => {
        let opts: PrettifyOptions = { encloseIpv6: true }
        expect(prettify("::1", opts)).toBe("[::1]")
        expect(prettify("2001:db8::1", opts)).toBe("[2001:db8::1]")
        expect(prettify("fe80::1%eth0", opts)).toBe("[fe80::1%eth0]")
    })

    it("handles already bracketed IPv6 gracefully (critical fix)", () => {
        expect(prettify("[2001:db8::1]")).toBe("2001:db8::1")
        expect(prettify("[::1]")).toBe("::1")
        expect(prettify("[2001:db8::1]:8080")).toBe("2001:db8::1")

        let opts = { encloseIpv6: true }
        expect(prettify("[2001:db8::1]", opts)).toBe("[2001:db8::1]")
        expect(prettify("[::1]:3000", opts)).toBe("[::1]")
    })

    it("handles complex IPv6 cases", () => {
        expect(prettify("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3:8d3:1319:8a2e:370:7348")
        expect(prettify("::ffff:192.168.1.1")).toBe("::ffff:192.168.1.1")
    })

    it("gracefully handles invalid/malformed input", () => {
        expect(prettify("")).toBe("")
        expect(prettify("   ")).toBe("")
        expect(prettify("not-a-valid:address")).toBe("not-a-valid:address")
    })

    it.todo("respects options consistently", () => {
        let enclose = { encloseIpv6: true }
        let noEnclose = { encloseIpv6: false }

        expect(prettify("::1", enclose)).toBe("[::1]")
        expect(prettify("::1", noEnclose)).toBe("::1")
    })
})
