import { beforeEach, describe, expect, it } from "vitest"
import { exactly, untilEnd } from "./strings"
import { PartialReadError } from "../../errors"

class MockReadable {
    #chunks: Uint8Array[]
    #idx = 0

    constructor(chunks: Uint8Array[]) {
        this.#chunks = chunks
    }

    async read(into: Uint8Array): Promise<number> {
        if (this.#idx >= this.#chunks.length) return 0
        let chunk = this.#chunks[this.#idx++]
        let n = Math.min(chunk.length, into.length)
        into.set(chunk.subarray(0, n))
        return n
    }
}

describe("exactly", () => {
    let readable: MockReadable

    beforeEach(() => {
        readable = new MockReadable([])
    })

    it("reads exactly N bytes on success", async () => {
        readable = new MockReadable([new Uint8Array([1, 2, 3, 4, 5])])
        let res = await exactly(readable, 5)
        expect(res).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    })

    it("reuses target buffer when length is Uint8Array", async () => {
        let target = new Uint8Array(5)
        readable = new MockReadable([new Uint8Array([10, 20, 30, 40, 50])])
        let res = await exactly(readable, target)
        expect(res).toBe(target)
        expect(res).toEqual(new Uint8Array([10, 20, 30, 40, 50]))
    })

    it("throws PartialReadError on premature EOF when onEof=error", async () => {
        readable = new MockReadable([new Uint8Array([1, 2])])
        await expect(exactly(readable, 5)).rejects.toBeInstanceOf(PartialReadError)
    })

    it("returns truncated data when onEof=truncate", async () => {
        readable = new MockReadable([new Uint8Array([1, 2, 3])])
        let res = await exactly(readable, 5, "truncate")
        expect(res).toEqual(new Uint8Array([1, 2, 3]))
    })

    it("handles zero-length request", async () => {
        let res = await exactly(readable, 0)
        expect(res).toEqual(new Uint8Array(0))
    })

    it("propagates errors from underlying readable", async () => {
        let boom = new Error("boom")
        readable = {
            async read() {
                throw boom
            },
        } as any

        await expect(exactly(readable, 10)).rejects.toBe(boom)
    })
})

describe("untilEnd", () => {
    it("drains entire stream into single Uint8Array", async () => {
        let readable = new MockReadable([
            new Uint8Array([1, 2, 3]),
            new Uint8Array([4, 5, 6, 7]),
            new Uint8Array([8, 9]),
        ])

        let res = await untilEnd(readable)
        expect(res).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))
    })

    it("returns empty array when stream is already at EOF", async () => {
        let readable = new MockReadable([])
        let res = await untilEnd(readable)
        expect(res).toEqual(new Uint8Array(0))
    })

    it("respects custom chunkSize", async () => {
        let readable = new MockReadable([new Uint8Array(5000)])
        let res = await untilEnd(readable, 1024)
        expect(res.length).toBe(1024)
    })

    it("propagates errors from readable", async () => {
        let boom = new Error("read error")
        let readable = {
            async read() {
                throw boom
            },
        } as any

        await expect(untilEnd(readable)).rejects.toBe(boom)
    })
})
