import { beforeEach, describe, expect, it, vi } from "vitest"
import { FramedWriter } from "./writer"
import { Bytes } from "../bytes"
import type { FrameEncoder } from "./types"
import type { Writable } from "../types"

class MockWritable implements Writable {
    write = vi.fn(async (_bytes: Uint8Array): Promise<void> => {})
}

class MockEncoder<Frame = Uint8Array> implements FrameEncoder<Frame> {
    encode = vi.fn(async (_frame: Frame, buf: Bytes): Promise<void> => {}) as any

    reset = () => {}
}

describe("FramedWriter", () => {
    let writer: FramedWriter
    let writable: MockWritable
    let encoder: MockEncoder

    beforeEach(() => {
        vi.clearAllMocks()
        writable = new MockWritable()
        encoder = new MockEncoder()
        writer = new FramedWriter(writable, encoder)
    })

    it("constructor defaults initialBufferSize to 1024", async () => {
        encoder.encode.mockImplementationOnce(async (_f: any, buf: Bytes) => {
            buf.writeSync(5).set([10, 20, 30, 40, 50])
        })

        await writer.write({} as any)

        expect(writable.write).toHaveBeenCalledOnce()
        expect(writable.write.mock.calls[0][0].length).toBe(5)
    })

    it("constructor respects custom initialBufferSize", async () => {
        let customWriter = new FramedWriter(writable, encoder, { initialBufferSize: 4096 })

        encoder.encode.mockImplementationOnce(async (_f: any, buf: Bytes) => {
            buf.writeSync(5).set([10, 20, 30, 40, 50])
        })

        await customWriter.write({} as any)

        expect(writable.write).toHaveBeenCalledOnce()
    })

    it("write calls encoder.encode with internal Bytes buffer", async () => {
        let frame = new Uint8Array([1, 2, 3])
        await writer.write(frame)

        expect(encoder.encode).toHaveBeenCalledOnce()
        expect(encoder.encode).toHaveBeenCalledWith(frame, expect.any(Bytes))
    })

    it("writes encoded data to underlying writable when result() is non-empty", async () => {
        encoder.encode.mockImplementationOnce(async (_f: any, buf: Bytes) => {
            buf.writeSync(5).set([10, 20, 30, 40, 50])
        })

        await writer.write({ id: 1 } as any)

        expect(writable.write).toHaveBeenCalledOnce()
        const written = writable.write.mock.calls[0][0]
        expect(written).toEqual(new Uint8Array([10, 20, 30, 40, 50]))
    })

    it("does NOT call writable.write when encoder produces empty result", async () => {
        encoder.encode.mockImplementationOnce(async () => {})

        await writer.write({} as any)

        expect(encoder.encode).toHaveBeenCalledOnce()
        expect(writable.write).not.toHaveBeenCalled()
    })

    it("resets internal buffer after every successful write (observable via next write)", async () => {
        encoder.encode.mockImplementationOnce(async (_f: any, buf: Bytes) => {
            buf.writeSync(3).set([1, 2, 3])
        })
        await writer.write({} as any)

        encoder.encode.mockImplementationOnce(async (_f: any, buf: Bytes) => {
            buf.writeSync(2).set([99, 88])
        })
        await writer.write({} as any)

        expect(writable.write).toHaveBeenCalledTimes(2)
        expect(writable.write.mock.calls[1][0]).toEqual(new Uint8Array([99, 88]))
    })

    it("propagates errors from encoder", async () => {
        let boom = new Error("encoder failed")
        encoder.encode.mockRejectedValueOnce(boom)

        await expect(writer.write({} as any)).rejects.toBe(boom)
        expect(writable.write).not.toHaveBeenCalled()
    })

    it("propagates errors from writable.write", async () => {
        encoder.encode.mockImplementationOnce(async (_f: any, buf: Bytes) => {
            buf.writeSync(1).set([99])
        })
        let boom = new Error("writable failed")
        writable.write.mockRejectedValueOnce(boom)

        await expect(writer.write({} as any)).rejects.toBe(boom)
    })

    it("full round-trip with real encoder", async () => {
        const realEncoder: FrameEncoder<Uint8Array> = {
            // @ts-ignore
            async encode(frame: Uint8Array, buf: Bytes) {
                buf.writeSync(frame.length).set(frame)
            },
        }

        const realWriter = new FramedWriter(writable, realEncoder)
        const frame = new Uint8Array([0xaa, 0xbb, 0xcc])

        await realWriter.write(frame)

        expect(writable.write).toHaveBeenCalledOnce()
        expect(writable.write.mock.calls[0][0]).toEqual(frame)
    })
})
