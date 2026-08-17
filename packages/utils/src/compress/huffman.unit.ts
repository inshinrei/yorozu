import { describe, expect, it } from "vitest"
import { readBits, writeBits } from "./bits"
import { buildDecodeMap, buildEncodeMap, buildLengthLimitedTree } from "./huffman"

describe("Huffman maps", () => {
    it("roundtrips a tiny canonical code", () => {
        let lengths = new Uint8Array([2, 1, 2])
        let encode = buildEncodeMap(lengths, 2)
        let decode = buildDecodeMap(lengths, 2)

        let buf = new Uint8Array(4)
        let pos = 0
        for (let symbol of [1, 0, 2]) {
            writeBits(buf, pos, encode[symbol])
            pos += lengths[symbol]
        }

        let out: number[] = []
        let bitPos = 0
        let mask = 3
        for (let i = 0; i < 3; i++) {
            let entry = decode[readBits(buf, bitPos, mask)]
            let symbol = entry >> 4
            bitPos += entry & 15
            out.push(symbol)
        }
        expect(out).toEqual([1, 0, 2])
    })

    it("builds length-limited trees that cover every used symbol", () => {
        let freqs = new Uint16Array([4, 1, 1, 8])
        let { lengths, maxBits } = buildLengthLimitedTree(freqs, 15)
        expect(maxBits).toBeGreaterThan(0)
        expect(maxBits).toBeLessThanOrEqual(15)
        for (let i = 0; i < freqs.length; i++) {
            if (freqs[i]) expect(lengths[i]).toBeGreaterThan(0)
        }
    })
})
