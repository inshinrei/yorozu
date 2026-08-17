import { randomBytes } from "node:crypto"
import { deflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { InvalidBlockTypeError, InvalidDistanceError, UnexpectedEofError } from "./errors"
import { Decompressor, decompress } from "./inflate"

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s)
}

describe("decompress", () => {
    it("inflates empty input produced by DEFLATE", () => {
        expect(decompress(deflateRawSync(new Uint8Array()))).toEqual(new Uint8Array())
    })

    it("inflates a short string", () => {
        expect(decompress(deflateRawSync(utf8("hello")))).toEqual(utf8("hello"))
    })

    it("inflates a long repeated payload", () => {
        let data = new Uint8Array(100 * 1024).fill(0x61)
        expect(decompress(deflateRawSync(data))).toEqual(data)
    })

    it("inflates incompressible random data", () => {
        let data = new Uint8Array(randomBytes(70 * 1024))
        expect(decompress(deflateRawSync(data))).toEqual(data)
    })

    it("inflates stored blocks", () => {
        let data = utf8("stored-block payload")
        expect(decompress(deflateRawSync(data, { level: 0 }))).toEqual(data)
    })

    it("writes into an exact out buffer", () => {
        let data = utf8("hello")
        let out = new Uint8Array(data.length)
        expect(decompress(deflateRawSync(data), { out })).toBe(out)
        expect(out).toEqual(data)
    })

    it("truncates when out is too small", () => {
        let data = utf8("hello")
        let out = new Uint8Array(2)
        expect(decompress(deflateRawSync(data), { out })).toEqual(utf8("he"))
    })

    it("uses a prefix of a larger out buffer", () => {
        let data = utf8("hello")
        let out = new Uint8Array(16)
        expect(decompress(deflateRawSync(data), { out })).toEqual(data)
    })

    it("roundtrips a preset dictionary", () => {
        let dict = utf8("the dictionary prefix ")
        let data = utf8("the dictionary prefix and more")
        let compressed = deflateRawSync(data, { dictionary: dict })
        expect(decompress(compressed, { dictionary: dict })).toEqual(data)
    })

    it("throws on a missing dictionary when distances require one", () => {
        let dict = utf8("the dictionary prefix ")
        let data = utf8("the dictionary prefix")
        let compressed = deflateRawSync(data, { dictionary: dict, level: 9 })
        expect(() => decompress(compressed)).toThrow(InvalidDistanceError)
    })

    it("throws UnexpectedEofError on a truncated stream", () => {
        let compressed = deflateRawSync(utf8("hello world"))
        expect(() => decompress(compressed.subarray(0, 2))).toThrow(UnexpectedEofError)
    })

    it("throws InvalidBlockTypeError on block type 3", () => {
        expect(() => decompress(new Uint8Array([0x06]))).toThrow(InvalidBlockTypeError)
    })
})

describe("Decompressor", () => {
    it("inflates one byte at a time", () => {
        let data = utf8("chunked inflate payload ".repeat(20))
        let compressed = deflateRawSync(data)
        let stream = new Decompressor()
        let chunks: Uint8Array[] = []
        for (let i = 0; i < compressed.length; i++) {
            let last = i === compressed.length - 1
            let out = stream.push(compressed.subarray(i, i + 1), last)
            if (out.length) chunks.push(out)
        }
        let joined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
        let offset = 0
        for (let chunk of chunks) {
            joined.set(chunk, offset)
            offset += chunk.length
        }
        expect(joined).toEqual(data)
    })
})
