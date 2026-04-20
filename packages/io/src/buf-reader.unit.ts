import { beforeEach, describe, expect, it } from "vitest"
import { BufReader } from "./buf-reader"

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

describe("BufReader", () => {
    let bufReader: BufReader
    let mock: MockReadable

    beforeEach(() => {
        mock = new MockReadable([])
        bufReader = new BufReader(mock)
    })

    it("constructor defaults to 4096 and enforces min 16", () => {
        expect(bufReader.bufferSize).toBe(4096)

        let small = new BufReader(mock, 8)
        expect(small.bufferSize).toBe(16)

        let custom = new BufReader(mock, 8192)
        expect(custom.bufferSize).toBe(8192)
    })

    it("buffered starts at 0", () => {
        expect(bufReader.buffered).toBe(0)
    })

    it("read serves directly from buffer when data present", async () => {
        mock = new MockReadable([new Uint8Array([10, 20, 30])])
        bufReader = new BufReader(mock, 16)

        let into = new Uint8Array(10)
        let n = await bufReader.read(into)

        expect(n).toBe(3)
        expect(bufReader.buffered).toBe(0)
        expect(into.subarray(0, 3)).toEqual(new Uint8Array([10, 20, 30]))
    })

    it("fills internal buffer when empty and into is smaller than buffer", async () => {
        mock = new MockReadable([new Uint8Array([1, 2, 3, 4, 5])])
        bufReader = new BufReader(mock, 16)

        let into = new Uint8Array(3)
        let n = await bufReader.read(into)

        expect(n).toBe(3)
        expect(bufReader.buffered).toBe(2)
        expect(into).toEqual(new Uint8Array([1, 2, 3]))
    })

    it("direct read bypass when into >= bufferSize", async () => {
        mock = new MockReadable([new Uint8Array([100, 101, 102])])
        bufReader = new BufReader(mock, 16)

        let large = new Uint8Array(32)
        let n = await bufReader.read(large)

        expect(n).toBe(3)
        expect(bufReader.buffered).toBe(0)
        expect(large.subarray(0, 3)).toEqual(new Uint8Array([100, 101, 102]))
    })

    it("multiple sequential reads across fill boundary", async () => {
        mock = new MockReadable([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7])])
        bufReader = new BufReader(mock, 16)

        let into = new Uint8Array(10)

        let n1 = await bufReader.read(into)
        expect(n1).toBe(3)

        let n2 = await bufReader.read(into.subarray(3))
        expect(n2).toBe(4)

        expect(bufReader.buffered).toBe(0)
        expect(into.subarray(0, 7)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7]))
    })

    it("returns 0 and stays at EOF after underlying ends", async () => {
        mock = new MockReadable([new Uint8Array([42])])
        bufReader = new BufReader(mock, 16)

        let into = new Uint8Array(10)
        await bufReader.read(into)

        let n = await bufReader.read(into)
        expect(n).toBe(0)

        expect(await bufReader.read(into)).toBe(0)
    })

    it("propagates errors from underlying readable", async () => {
        let boom = new Error("underlying boom")
        let badMock: Readable = {
            async read() {
                throw boom
            },
        }

        bufReader = new BufReader(badMock)
        await expect(bufReader.read(new Uint8Array(10))).rejects.toBe(boom)
    })

    it("buffered getter reflects current state after partial reads", async () => {
        mock = new MockReadable([new Uint8Array([1, 2, 3, 4, 5, 6])])
        bufReader = new BufReader(mock, 16)

        let into = new Uint8Array(2)
        await bufReader.read(into)
        expect(bufReader.buffered).toBe(4)

        await bufReader.read(into)
        expect(bufReader.buffered).toBe(2)
    })
})
