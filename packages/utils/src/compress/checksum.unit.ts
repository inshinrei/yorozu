import { describe, expect, it } from "vitest"
import { Adler32, Crc32, adler32, crc32 } from "./checksum"

let encoder = new TextEncoder()

describe("crc32", () => {
    it("returns 0 for empty input", () => {
        expect(crc32(new Uint8Array())).toBe(0)
    })

    it("matches the ISO 3309 check vector", () => {
        expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926)
    })

    it("streams to the same digest as one-shot", () => {
        let data = encoder.encode("123456789")
        let acc = new Crc32()
        acc.update(data.subarray(0, 4))
        acc.update(data.subarray(4))
        expect(acc.digest()).toBe(crc32(data))
    })

    it("chains via seed", () => {
        let a = encoder.encode("1234")
        let b = encoder.encode("56789")
        expect(crc32(b, crc32(a))).toBe(crc32(encoder.encode("123456789")))
    })
})

describe("adler32", () => {
    it("returns 1 for empty input", () => {
        expect(adler32(new Uint8Array())).toBe(1)
    })

    it("matches the RFC 1950 check vector", () => {
        expect(adler32(encoder.encode("123456789"))).toBe(0x091e01de)
    })

    it("streams to the same digest as one-shot", () => {
        let data = encoder.encode("123456789")
        let acc = new Adler32()
        acc.update(data.subarray(0, 4))
        acc.update(data.subarray(4))
        expect(acc.digest()).toBe(adler32(data))
    })

    it("chains via seed", () => {
        let a = encoder.encode("1234")
        let b = encoder.encode("56789")
        expect(adler32(b, adler32(a))).toBe(adler32(encoder.encode("123456789")))
    })
})
