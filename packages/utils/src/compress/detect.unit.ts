import { describe, expect, it } from "vitest"
import { compress as gzipCompress } from "./gzip"
import { compress as rawCompress } from "./deflate"
import { compress as zlibCompress } from "./zlib"
import { decompress } from "./detect"

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s)
}

describe("decompress autodetection", () => {
    it("detects gzip", () => {
        let data = utf8("auto gzip")
        expect(decompress(gzipCompress(data))).toEqual(data)
    })

    it("detects zlib", () => {
        let data = utf8("auto zlib")
        expect(decompress(zlibCompress(data))).toEqual(data)
    })

    it("detects raw DEFLATE", () => {
        let data = utf8("auto raw")
        expect(decompress(rawCompress(data))).toEqual(data)
    })

    it("treats a failed zlib CMF check as raw DEFLATE", () => {
        let data = utf8("not zlib")
        let raw = rawCompress(data, { level: 0 })
        expect(((raw[0] << 8) | raw[1]) % 31).not.toBe(0)
        expect(decompress(raw)).toEqual(data)
    })
})
