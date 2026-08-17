import { describe, expect, it } from "vitest"
import { compress, decompress } from "./index"

describe("public namespaces", () => {
    it("exposes compress/decompress format methods", () => {
        let data = new TextEncoder().encode("namespace api")
        expect(decompress.deflate(compress.deflate(data))).toEqual(data)
        expect(decompress.gzip(compress.gzip(data))).toEqual(data)
        expect(decompress.zlib(compress.zlib(data))).toEqual(data)
        expect(decompress.auto(compress.gzip(data))).toEqual(data)
    })
})
