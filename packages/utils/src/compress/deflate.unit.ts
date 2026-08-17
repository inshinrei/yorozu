import { randomBytes } from "node:crypto"
import { inflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { compress, Compressor } from "./deflate"
import { decompress } from "./inflate"

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s)
}

function asBytes(data: Uint8Array): Uint8Array {
    return new Uint8Array(data)
}

describe("compress", () => {
    it.each([0, 1, 6, 9] as const)("is inflated by Node at level %s", (level) => {
        let data = utf8("hello deflate ".repeat(50))
        expect(asBytes(inflateRawSync(compress(data, { level })))).toEqual(data)
    })

    it("roundtrips with decompress", () => {
        let data = utf8("roundtrip payload ".repeat(40))
        expect(decompress(compress(data))).toEqual(data)
    })

    it("stores at level 0", () => {
        let data = utf8("no compression")
        expect(asBytes(inflateRawSync(compress(data, { level: 0 })))).toEqual(data)
        expect(decompress(compress(data, { level: 0 }))).toEqual(data)
    })

    it("compresses empty input", () => {
        expect(asBytes(inflateRawSync(compress(new Uint8Array())))).toEqual(new Uint8Array())
    })

    it("roundtrips a preset dictionary", () => {
        let dict = utf8("shared prefix ")
        let data = utf8("shared prefix and the rest")
        let compressed = compress(data, { dictionary: dict, level: 6 })
        expect(asBytes(inflateRawSync(compressed, { dictionary: dict }))).toEqual(data)
        expect(decompress(compressed, { dictionary: dict })).toEqual(data)
    })

    it("roundtrips random bytes", () => {
        let data = new Uint8Array(randomBytes(32 * 1024))
        expect(decompress(compress(data, { level: 1 }))).toEqual(data)
    })
})

describe("Compressor", () => {
    it("matches one-shot when pushed in chunks", () => {
        let data = utf8("chunked compress payload ".repeat(80))
        let oneShot = compress(data, { level: 6 })
        let stream = new Compressor({ level: 6 })
        let parts: Uint8Array[] = []
        let mid = (data.length / 2) | 0
        parts.push(stream.push(data.subarray(0, mid)))
        parts.push(stream.push(data.subarray(mid), true))
        let joined = concat(parts)
        expect(decompress(joined)).toEqual(data)
        expect(decompress(oneShot)).toEqual(data)
    })

    it("emits a sync flush that stays decompressible", () => {
        let stream = new Compressor({ level: 6 })
        let a = stream.push(utf8("first"))
        let flushed = stream.flush(true)
        let b = stream.push(utf8("second"), true)
        expect(decompress(concat([a, flushed, b]))).toEqual(utf8("firstsecond"))
    })
})

function concat(parts: Uint8Array[]): Uint8Array {
    let out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let offset = 0
    for (let part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}
