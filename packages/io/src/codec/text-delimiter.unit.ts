import { beforeEach, describe, expect, it } from "vitest"
import { TextDelimiterCodec } from "./text-delimiter"
import { Bytes } from "../bytes"

describe("TextDelimiterCodec", () => {
    let codec: TextDelimiterCodec
    let buf: Bytes

    beforeEach(() => {
        buf = Bytes.allocate(128)
    })

    it("decode returns null when inner returns null", () => {
        codec = new TextDelimiterCodec("\n")
        buf.writeSync(3).set([65, 66, 67])

        let frame = codec.decode(buf, false)
        expect(frame).toBeNull()
    })

    it("decode returns decoded string when inner returns data (discard strategy)", () => {
        codec = new TextDelimiterCodec("\n")
        buf.writeSync(6).set([72, 101, 108, 108, 111, 10])

        let frame = codec.decode(buf, false)
        expect(frame).toBe("Hello")
        expect(buf.available).toBe(0)
    })

    it("decode respects keep strategy", () => {
        codec = new TextDelimiterCodec("\r\n", { strategy: "keep" })
        buf.writeSync(7).set([72, 101, 108, 108, 111, 13, 10])

        let frame = codec.decode(buf, false)
        expect(frame).toBe("Hello\r\n")
    })

    it("decode returns full remaining text on EOF", () => {
        codec = new TextDelimiterCodec("\n")
        buf.writeSync(5).set([87, 111, 114, 108, 100])

        let frame = codec.decode(buf, true)
        expect(frame).toBe("World")
    })

    it("encode writes UTF-8 string + delimiter", () => {
        codec = new TextDelimiterCodec("\r\n")
        let out = Bytes.allocate(64)

        codec.encode("Hello", out)

        expect(out.result()).toEqual(new Uint8Array([72, 101, 108, 108, 111, 13, 10]))
    })

    it("encode handles empty string", () => {
        codec = new TextDelimiterCodec("\n")
        let out = Bytes.allocate(32)

        codec.encode("", out)

        expect(out.result()).toEqual(new Uint8Array([10]))
    })

    it("full round-trip with discard strategy", () => {
        codec = new TextDelimiterCodec("\n")

        let out = Bytes.allocate(128)
        codec.encode("Hello", out)
        codec.encode("World", out)

        let frame1 = codec.decode(out, false)
        let frame2 = codec.decode(out, false)

        expect(frame1).toBe("Hello")
        expect(frame2).toBe("World")
    })

    it("full round-trip with keep strategy", () => {
        codec = new TextDelimiterCodec("\r\n", { strategy: "keep" })

        let out = Bytes.allocate(128)
        codec.encode("Test", out)

        let frame = codec.decode(out, false)
        expect(frame).toBe("Test\r\n")
    })

    it("handles multi-byte UTF-8 characters correctly", () => {
        codec = new TextDelimiterCodec("\n")
        let out = Bytes.allocate(64)

        codec.encode("こんにちは", out)

        let frame = codec.decode(out, true)
        expect(frame).toBe("こんにちは")
    })
})
