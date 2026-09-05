import { beforeEach, describe, expect, it } from "vitest"
import { LengthDelimitedCodec } from "./length-delimited"
import { Bytes } from "../bytes"

describe("LengthDelimitedCodec", () => {
    let codec: LengthDelimitedCodec
    let buf: Bytes

    const u16beRead = (r: Bytes): number | null => {
        if (r.available < 2) return null
        let hi = r.readSync(1)[0]
        let lo = r.readSync(1)[0]
        return (hi << 8) | lo
    }

    const u16beWrite = (w: any, n: number): void => {
        let slice = w.writeSync(2)
        slice[0] = (n >> 8) & 0xff
        slice[1] = n & 0xff
        w.disposeWriteSync()
    }

    beforeEach(() => {
        buf = Bytes.allocate(128)
    })

    it("throws on decode when no read function provided", () => {
        codec = new LengthDelimitedCodec({ write: u16beWrite })
        expect(() => codec.decode(buf)).toThrow("Read function not provided.")
    })

    it("throws on encode when no write function provided", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead })
        expect(() => codec.encode(new Uint8Array([1]), buf)).toThrow("Write function not provided.")
    })

    it("decode returns null when length prefix not fully readable", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead })
        buf.writeSync(1).set([0x00])

        let frame = codec.decode(buf)
        expect(frame).toBeNull()
        expect(buf.available).toBe(1)
    })

    it("decode succeeds when full frame present (pending path)", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead })
        buf.writeSync(6).set([0x00, 0x03, 0x11, 0x22, 0x33, 0xff])

        let frame = codec.decode(buf)
        expect(frame).toEqual(new Uint8Array([0x11, 0x22, 0x33]))
        expect(buf.available).toBe(1)
    })

    it("decode recursion path: length first, then payload in same call", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead })
        buf.writeSync(5).set([0x00, 0x03, 0xaa, 0xbb, 0xcc])

        let frame = codec.decode(buf)
        expect(frame).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]))
        expect(buf.available).toBe(0)
    })

    it("pendingLength survives across multiple decode calls", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead })
        buf.writeSync(2).set([0x00, 0x04])
        expect(codec.decode(buf)).toBeNull()
        expect(buf.available).toBe(0)

        buf.writeSync(4).set([0x01, 0x02, 0x03, 0x04])
        let frame = codec.decode(buf)
        expect(frame).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04]))
    })

    it("encode writes length prefix then frame", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead, write: u16beWrite })
        let out = Bytes.allocate(32)

        let data = new Uint8Array([0x11, 0x22, 0x33])
        codec.encode(data, out)

        expect(out.result()).toEqual(new Uint8Array([0x00, 0x03, 0x11, 0x22, 0x33]))
    })

    it("reset clears pendingLength", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead })
        buf.writeSync(2).set([0x00, 0x05])
        codec.decode(buf)

        codec.reset()
        expect(() => codec.decode(Bytes.allocate(0))).not.toThrow()
    })

    it("full round-trip with u16be length", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead, write: u16beWrite })

        let out = Bytes.allocate(64)
        let payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
        codec.encode(payload, out)

        let decoded = codec.decode(out)
        expect(decoded).toEqual(payload)
        expect(out.available).toBe(0)
    })

    it("handles zero-length frames correctly", () => {
        codec = new LengthDelimitedCodec({ read: u16beRead, write: u16beWrite })
        let out = Bytes.allocate(32)

        codec.encode(new Uint8Array(0), out)

        let decoded = codec.decode(out)
        expect(decoded).toEqual(new Uint8Array(0))
    })
})
