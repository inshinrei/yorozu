import { deflateSync, inflateSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { ChecksumMismatchError, InvalidHeaderError } from "./errors"
import { compress, decompress, Compressor, Decompressor } from "./zlib"

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s)
}

function asBytes(data: Uint8Array): Uint8Array {
    return new Uint8Array(data)
}

function concat(parts: Uint8Array[]): Uint8Array {
    let out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let offset = 0
    for (let part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

describe("zlib", () => {
    it("roundtrips with Node", () => {
        let data = utf8("zlib payload ".repeat(20))
        expect(asBytes(inflateSync(compress(data)))).toEqual(data)
        expect(decompress(new Uint8Array(deflateSync(data)))).toEqual(data)
    })

    it("roundtrips a preset dictionary", () => {
        let dict = utf8("shared ")
        let data = utf8("shared dictionary text")
        let compressed = compress(data, { dictionary: dict, level: 6 })
        expect(asBytes(inflateSync(compressed, { dictionary: dict }))).toEqual(data)
        expect(decompress(compressed, { dictionary: dict })).toEqual(data)
    })

    it("throws when a dictionary is missing or unexpected", () => {
        let dict = utf8("shared ")
        let data = utf8("shared dictionary text")
        let withDict = compress(data, { dictionary: dict })
        let without = compress(data)
        expect(() => decompress(withDict)).toThrow(InvalidHeaderError)
        expect(() => decompress(without, { dictionary: dict })).toThrow(InvalidHeaderError)
    })

    it("throws on a bad CMF/FLG check", () => {
        expect(() => decompress(new Uint8Array([0x78, 0x00]))).toThrow(InvalidHeaderError)
    })

    it("throws on a checksum mismatch", () => {
        let out = compress(utf8("adler"))
        out[out.length - 1] ^= 0xff
        expect(() => decompress(out)).toThrow(ChecksumMismatchError)
    })

    it("skips the checksum when check is false", () => {
        let data = utf8("adler")
        let out = compress(data)
        out[out.length - 1] ^= 0xff
        expect(decompress(out, { check: false })).toEqual(data)
    })

    it("streams both directions", () => {
        let data = utf8("zlib stream payload")
        let encoder = new Compressor()
        let compressed = concat([encoder.push(data.subarray(0, 5)), encoder.push(data.subarray(5), true)])
        expect(asBytes(inflateSync(compressed))).toEqual(data)

        let decoder = new Decompressor()
        let parts = [decoder.push(compressed.subarray(0, 4)), decoder.push(compressed.subarray(4), true)]
        expect(concat(parts.filter((p) => p.length))).toEqual(data)
    })
})
