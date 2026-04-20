import { beforeEach, describe, expect, it } from "vitest"
import { ReaderWithFinal } from "./reader-with-final"

interface Readable {
    read(into: Uint8Array): Promise<number>
}

class MockReadable implements Readable {
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

describe("ReaderWithFinal", () => {
    let readable: ReaderWithFinal
    let mock: MockReadable

    beforeEach(() => {
        mock = new MockReadable([])
        readable = new ReaderWithFinal(mock)
    })

    it("returns {0, true} immediately when underlying is already ended", async () => {
        mock = new MockReadable([])
        readable = new ReaderWithFinal(mock)

        let res = await readable.readWithFinal(new Uint8Array(10))
        expect(res).toEqual({ nread: 0, final: true })

        res = await readable.readWithFinal(new Uint8Array(10))
        expect(res).toEqual({ nread: 0, final: true })
    })

    it("single chunk – second readWithFinal returns final true", async () => {
        mock = new MockReadable([new Uint8Array([1, 2, 3, 4])])
        readable = new ReaderWithFinal(mock)

        let into = new Uint8Array(10)
        let res = await readable.readWithFinal(into)
        expect(res).toEqual({ nread: 4, final: true })
        expect(into.subarray(0, 4)).toEqual(new Uint8Array([1, 2, 3, 4]))

        res = await readable.readWithFinal(into)
        expect(res).toEqual({ nread: 0, final: true })
    })

    it("multiple chunks – detects non-final until last", async () => {
        mock = new MockReadable([new Uint8Array([10, 20]), new Uint8Array([30, 40, 50])])
        readable = new ReaderWithFinal(mock)

        let into = new Uint8Array(10)
        let res = await readable.readWithFinal(into)
        expect(res).toEqual({ nread: 2, final: false })

        res = await readable.readWithFinal(into)
        expect(res).toEqual({ nread: 3, final: true })

        res = await readable.readWithFinal(into)
        expect(res).toEqual({ nread: 0, final: true })
    })

    it("partial consume of prev buffer when into is smaller", async () => {
        mock = new MockReadable([new Uint8Array([1, 2, 3, 4, 5])])
        readable = new ReaderWithFinal(mock)

        let into = new Uint8Array(3)
        let res = await readable.readWithFinal(into)
        expect(res).toEqual({ nread: 3, final: false })
        expect(into).toEqual(new Uint8Array([1, 2, 3]))

        into = new Uint8Array(10)
        res = await readable.readWithFinal(into)
        expect(res).toEqual({ nread: 2, final: true })
        expect(into.subarray(0, 2)).toEqual(new Uint8Array([4, 5]))
    })

    it("read() delegates and returns only nread", async () => {
        mock = new MockReadable([new Uint8Array([9, 8, 7])])
        readable = new ReaderWithFinal(mock)

        let into = new Uint8Array(5)
        let n = await readable.read(into)
        expect(n).toBe(3)
        expect(into.subarray(0, 3)).toEqual(new Uint8Array([9, 8, 7]))
    })

    it("propagates errors from underlying readable", async () => {
        let boom = new Error("boom")
        let badMock: Readable = {
            async read() {
                throw boom
            },
        }

        readable = new ReaderWithFinal(badMock)
        await expect(readable.readWithFinal(new Uint8Array(10))).rejects.toBe(boom)
    })

    it("handles zero-length into safely", async () => {
        mock = new MockReadable([new Uint8Array([1, 2])])
        readable = new ReaderWithFinal(mock)

        let res = await readable.readWithFinal(new Uint8Array(0))
        expect(res.nread).toBe(0)
        expect(res.final).toBe(false)
    })

    it("multiple calls after final stay at {0, true}", async () => {
        mock = new MockReadable([new Uint8Array([42])])
        readable = new ReaderWithFinal(mock)

        await readable.readWithFinal(new Uint8Array(10))
        let res1 = await readable.readWithFinal(new Uint8Array(10))
        let res2 = await readable.readWithFinal(new Uint8Array(10))

        expect(res1).toEqual({ nread: 0, final: true })
        expect(res2).toEqual({ nread: 0, final: true })
    })
})
