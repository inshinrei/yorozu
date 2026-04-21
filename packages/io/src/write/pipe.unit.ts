import { beforeEach, describe, expect, it, vi } from "vitest"
import { pipe } from "./pipe"

interface Readable {
    read(into: Uint8Array): Promise<number>
}

interface Writable {
    write(chunk: Uint8Array): Promise<void>
}

class MockReadable implements Readable {
    #chunks: Uint8Array[]
    #idx = 0

    constructor(chunks: Uint8Array[]) {
        this.#chunks = chunks
    }

    async read(into: Uint8Array): Promise<number> {
        if (this.#idx >= this.#chunks.length) return 0
        const chunk = this.#chunks[this.#idx++]
        const n = Math.min(chunk.length, into.length)
        into.set(chunk.subarray(0, n))
        return n
    }
}

class MockWritable implements Writable {
    write = vi.fn(async (_chunk: Uint8Array): Promise<void> => {})
}

describe("pipe", () => {
    let readable: MockReadable
    let writable: MockWritable

    beforeEach(() => {
        vi.clearAllMocks()
        writable = new MockWritable()
    })

    it("pipes all data until EOF using a single reusable chunk", async () => {
        readable = new MockReadable([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7]), new Uint8Array([8, 9])])

        await pipe(writable, readable)

        expect(writable.write).toHaveBeenCalledTimes(3)
        expect(writable.write.mock.calls[0][0]).toEqual(new Uint8Array([8, 9, 6]))
        expect(writable.write.mock.calls[1][0]).toEqual(new Uint8Array([8, 9, 6, 7]))
        expect(writable.write.mock.calls[2][0]).toEqual(new Uint8Array([8, 9]))
    })

    it("handles empty stream immediately", async () => {
        readable = new MockReadable([])

        await pipe(writable, readable)

        expect(writable.write).not.toHaveBeenCalled()
    })

    it("propagates error from readable.read", async () => {
        const boom = new Error("read failed")
        readable = {
            async read() {
                throw boom
            },
        } as any

        await expect(pipe(writable, readable)).rejects.toBe(boom)
        expect(writable.write).not.toHaveBeenCalled()
    })

    it("propagates error from writable.write", async () => {
        const boom = new Error("write failed")
        readable = new MockReadable([new Uint8Array([1, 2, 3])])
        writable.write.mockRejectedValueOnce(boom)

        await expect(pipe(writable, readable)).rejects.toBe(boom)
    })

    it("stops immediately on first nread === 0", async () => {
        readable = new MockReadable([new Uint8Array([1, 2]), new Uint8Array(0)])

        await pipe(writable, readable)

        expect(writable.write).toHaveBeenCalledOnce()
        expect(writable.write).toHaveBeenCalledWith(new Uint8Array([1, 2]))
    })

    it("reuses the same chunk buffer across reads (zero extra allocations)", async () => {
        readable = new MockReadable([new Uint8Array([10, 20]), new Uint8Array([30, 40, 50])])

        await pipe(writable, readable)

        expect(writable.write.mock.calls[0][0].buffer).toBe(writable.write.mock.calls[1][0].buffer)
    })

    it("full round-trip with real Bytes", async () => {
        const { Bytes } = await import("../bytes")
        const source = Bytes.from(new Uint8Array([100, 101, 102, 103]))
        const sink = Bytes.allocate(64)

        await pipe(sink, source)

        expect(sink.result()).toEqual(new Uint8Array([100, 101, 102, 103]))
    })
})
