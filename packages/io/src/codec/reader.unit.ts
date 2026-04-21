import { beforeEach, describe, expect, it, vi } from "vitest"
import { FramedReader } from "./reader"
import { Bytes } from "../bytes"
import type { FrameDecoder } from "./types"
import { Readable } from "../types"

class MockReadable implements Readable {
    read = vi.fn(async (_into: Uint8Array): Promise<number> => 0)
}

class MockDecoder<Frame = Uint8Array> implements FrameDecoder<Frame> {
    decode = vi.fn(async (_buf: Bytes, _eof: boolean): Promise<Frame | null> => null)
    reset = vi.fn()
}

describe("FramedReader", () => {
    let reader: FramedReader<any>
    let readable: MockReadable
    let decoder: MockDecoder

    beforeEach(() => {
        vi.clearAllMocks()
        readable = new MockReadable()
        decoder = new MockDecoder()
        reader = new FramedReader(readable, decoder)
    })

    it("read() calls decoder.decode with eof=false until frame is produced", async () => {
        decoder.decode.mockResolvedValueOnce(null)
        decoder.decode.mockResolvedValueOnce(new Uint8Array([1, 2, 3]))

        readable.read.mockResolvedValueOnce(10)

        let frame = await reader.read()
        expect(frame).toEqual(new Uint8Array([1, 2, 3]))
        expect(decoder.decode).toHaveBeenCalledTimes(2)
        expect(decoder.decode.mock.calls[0][1]).toBe(false)
    })

    it("read() returns null on EOF with no more frames", async () => {
        decoder.decode.mockResolvedValueOnce(null)
        readable.read.mockResolvedValueOnce(0) // EOF

        let frame = await reader.read()
        expect(frame).toBeNull()
    })

    it("read() continues reading when decoder returns null (partial frame)", async () => {
        decoder.decode.mockResolvedValueOnce(null)
        decoder.decode.mockResolvedValueOnce(new Uint8Array([9, 8, 7]))

        readable.read.mockResolvedValueOnce(3)
        readable.read.mockResolvedValueOnce(3)

        let frame = await reader.read()
        expect(frame).toEqual(new Uint8Array([9, 8, 7]))
        expect(readable.read).toHaveBeenCalledTimes(2)
    })

    it("async iterator yields frames until null", async () => {
        decoder.decode
            .mockResolvedValueOnce(new Uint8Array([1]))
            .mockResolvedValueOnce(new Uint8Array([2]))
            .mockResolvedValueOnce(null)

        readable.read.mockResolvedValueOnce(10).mockResolvedValueOnce(0)

        let frames: any[] = []
        for await (let f of reader) {
            frames.push(f)
        }

        expect(frames).toEqual([new Uint8Array([1]), new Uint8Array([2])])
    })

    it("propagates errors from readable.read", async () => {
        let boom = new Error("read failed")
        readable.read.mockRejectedValueOnce(boom)

        await expect(reader.read()).rejects.toBe(boom)
    })

    it("calls decoder.reset only when provided (defensive)", async () => {
        let frame = new Uint8Array([1])
        decoder.decode.mockResolvedValueOnce(frame)
        readable.read.mockResolvedValueOnce(1)

        await reader.read()

        expect(decoder.reset).not.toHaveBeenCalled()
    })
})
