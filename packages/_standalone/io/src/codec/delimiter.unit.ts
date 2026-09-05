import { beforeEach, describe, expect, it, vi } from "vitest"
import { DelimiterCodec } from "./delimiter"
import { Bytes } from "../bytes"

describe("DelimiterCodec", () => {
    let codec: DelimiterCodec
    let buf: Bytes

    beforeEach(() => {
        buf = Bytes.allocate(128)
    })

    it("decode returns null and rewinds when delimiter not found (non-EOF)", () => {
        codec = new DelimiterCodec(new Uint8Array([0x0d, 0x0a]))
        buf.writeSync(5).set([1, 2, 3, 4, 5])

        let frame = codec.decode(buf, false)
        expect(frame).toBeNull()
        expect(buf.available).toBe(5)
    })

    it("decode returns complete frame when delimiter found (discard)", () => {
        codec = new DelimiterCodec(new Uint8Array([0x0d, 0x0a])) // \r\n
        buf.writeSync(8).set([65, 66, 67, 0x0d, 0x0a, 88, 89, 90]) // ABC\r\nXYZ

        let frame = codec.decode(buf, false)
        expect(frame).toEqual(new Uint8Array([65, 66, 67]))
        expect(buf.available).toBe(3) // XYZ left in buffer
    })

    it("decode includes delimiter when strategy = keep", () => {
        codec = new DelimiterCodec(new Uint8Array([0x0a]), { strategy: "keep" })
        buf.writeSync(5).set([1, 2, 3, 0x0a, 4])

        let frame = codec.decode(buf, false)
        expect(frame).toEqual(new Uint8Array([1, 2, 3, 0x0a]))
        expect(buf.available).toBe(1)
    })

    it("decode returns everything on EOF when no delimiter present", () => {
        codec = new DelimiterCodec(new Uint8Array([0xff]))
        buf.writeSync(4).set([10, 20, 30, 40])

        let frame = codec.decode(buf, true)
        expect(frame).toEqual(new Uint8Array([10, 20, 30, 40]))
        expect(buf.available).toBe(0)
    })

    it("decode returns null on EOF with empty buffer", () => {
        codec = new DelimiterCodec(new Uint8Array([0x00]))
        let frame = codec.decode(buf, true)
        expect(frame).toBeNull()
    })

    it("decode handles multiple delimiters correctly (first one only)", () => {
        codec = new DelimiterCodec(new Uint8Array([0x0a]))
        buf.writeSync(10).set([1, 0x0a, 2, 0x0a, 3, 0x0a, 4, 5, 6, 7])

        let frame = codec.decode(buf, false)
        expect(frame).toEqual(new Uint8Array([1]))
        expect(buf.available).toBe(8)
    })

    it("encode appends delimiter using SyncWritable", () => {
        codec = new DelimiterCodec(new Uint8Array([0x0d, 0x0a]))
        let mockWritable = {
            writeSync: vi.fn((size: number) => {
                let slice = new Uint8Array(size)
                return slice
            }),
            disposeWriteSync: () => {},
        } as any

        let data = new Uint8Array([1, 2, 3])
        codec.encode(data, mockWritable)

        expect(mockWritable.writeSync).toHaveBeenCalledWith(5)
    })

    it("encode with real Bytes produces exact data + delimiter", () => {
        codec = new DelimiterCodec(new Uint8Array([0xab, 0xcd]))
        let out = Bytes.allocate(32)

        let data = new Uint8Array([0x11, 0x22, 0x33])
        codec.encode(data, out)

        expect(out.result()).toEqual(new Uint8Array([0x11, 0x22, 0x33, 0xab, 0xcd]))
    })

    it("reset is a no-op", () => {
        codec = new DelimiterCodec(new Uint8Array([1]))
        expect(() => codec.reset()).not.toThrow()
    })

    it("full decode/encode round-trip with discard strategy", () => {
        codec = new DelimiterCodec(new Uint8Array([0x0d, 0x0a]))

        let out = Bytes.allocate(64)
        codec.encode(new Uint8Array([72, 101, 108, 108, 111]), out)

        let frame = codec.decode(out, false)
        expect(frame).toEqual(new Uint8Array([72, 101, 108, 108, 111]))
    })
})
