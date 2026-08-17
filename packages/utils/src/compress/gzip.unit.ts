import { gzipSync, gunzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { ChecksumMismatchError, InvalidHeaderError } from "./errors"
import { compress, decompress, Compressor, Decompressor } from "./gzip"

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

describe("gzip", () => {
    it("roundtrips with Node", () => {
        let data = utf8("gzip payload ".repeat(20))
        expect(asBytes(gunzipSync(compress(data)))).toEqual(data)
        expect(decompress(new Uint8Array(gzipSync(data)))).toEqual(data)
    })

    it("writes a zero mtime and a filename", () => {
        let data = utf8("named")
        let out = compress(data, { filename: "a.txt", mtime: 0 })
        expect(out[0]).toBe(31)
        expect(out[1]).toBe(139)
        expect(out[2]).toBe(8)
        expect(out[3] & 8).toBe(8)
        expect(out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24)).toBe(0)
        expect(asBytes(gunzipSync(out))).toEqual(data)
        expect(decompress(out)).toEqual(data)
    })

    it("inflates concatenated members", () => {
        let a = compress(utf8("one"))
        let b = compress(utf8("two"))
        expect(decompress(concat([a, b]))).toEqual(utf8("onetwo"))
    })

    it("throws on a bad header", () => {
        expect(() => decompress(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(InvalidHeaderError)
    })

    it("throws on a checksum mismatch", () => {
        let out = compress(utf8("crc"))
        out[out.length - 8] ^= 0xff
        expect(() => decompress(out)).toThrow(ChecksumMismatchError)
    })

    it("skips the checksum when check is false", () => {
        let data = utf8("crc")
        let out = compress(data)
        out[out.length - 8] ^= 0xff
        expect(decompress(out, { check: false })).toEqual(data)
    })

    it("skips FEXTRA, FCOMMENT, and FHCRC on input", () => {
        let body = compress(utf8("x"))
        let extra = new Uint8Array([
            31, 139, 8, 4 | 16 | 2, 0, 0, 0, 0, 0, 3, 2, 0, 0x61, 0x62, 99, 0, 0, 0,
        ])
        let merged = concat([extra, body.subarray(10)])
        expect(decompress(merged, { check: false })).toEqual(utf8("x"))
    })

    it("decompresses a header split across pushes", () => {
        let data = utf8("streamed gzip")
        let compressed = compress(data)
        let stream = new Decompressor()
        let parts: Uint8Array[] = []
        parts.push(stream.push(compressed.subarray(0, 4)))
        parts.push(stream.push(compressed.subarray(4), true))
        expect(concat(parts.filter((p) => p.length))).toEqual(data)
    })

    it("compresses in a stream", () => {
        let data = utf8("streamed gzip compress")
        let stream = new Compressor()
        let out = concat([stream.push(data.subarray(0, 8)), stream.push(data.subarray(8), true)])
        expect(asBytes(gunzipSync(out))).toEqual(data)
    })
})
