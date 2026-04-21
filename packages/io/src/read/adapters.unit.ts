import { describe, expect, it, vi } from "vitest"
import { webReadableToYoro, yoroReadableToWeb, yoroSyncReadableToAsync } from "./adapters"

interface SyncReadable {
    readSync(size: number): Uint8Array
}

class MockSyncReadable implements SyncReadable {
    #chunks: Uint8Array[]
    #idx = 0

    constructor(chunks: Uint8Array[]) {
        this.#chunks = chunks
    }

    readSync(size: number): Uint8Array {
        if (this.#idx >= this.#chunks.length) return new Uint8Array(0)
        let chunk = this.#chunks[this.#idx++]
        let n = Math.min(size, chunk.length)
        return chunk.subarray(0, n)
    }
}

describe("stream adapters", () => {
    it("yoroSyncReadableToAsync converts sync to async with zero copy", async () => {
        let sync = new MockSyncReadable([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])])
        let asyncReadable = yoroSyncReadableToAsync(sync)

        let into = new Uint8Array(10)
        let n1 = await asyncReadable.read(into)
        expect(n1).toBe(3)
        expect(into.subarray(0, 3)).toEqual(new Uint8Array([1, 2, 3]))

        let n2 = await asyncReadable.read(into)
        expect(n2).toBe(2)
        expect(into.subarray(0, 2)).toEqual(new Uint8Array([4, 5]))
    })

    describe("webReadableToYoro", () => {
        it("uses BYOB path when stream supports it", async () => {
            let stream = new ReadableStream({
                type: "bytes",
                start(c) {
                    c.enqueue(new Uint8Array([10, 20, 30]))
                    c.close()
                },
            })

            let yoro = webReadableToYoro(stream)
            let into = new Uint8Array(10)
            let n = await yoro.read(into)

            expect(n).toBe(3)
            expect(into.subarray(0, 3)).toEqual(new Uint8Array([10, 20, 30]))
        })

        it("close() cancels the web reader", async () => {
            let cancelSpy = vi.fn()
            let stream = new ReadableStream({
                cancel: cancelSpy,
            })

            let yoro = webReadableToYoro(stream)
            yoro.close()

            expect(cancelSpy).toHaveBeenCalledOnce()
        })

        it("handles immediate EOF correctly", async () => {
            let stream = new ReadableStream({
                start(c) {
                    c.close()
                },
            })
            let yoro = webReadableToYoro(stream)

            let into = new Uint8Array(10)
            let n = await yoro.read(into)
            expect(n).toBe(0)
        })
    })

    describe("yoroReadableToWeb", () => {
        it("uses BYOB controller when available", async () => {
            let yoro = {
                async read(into: Uint8Array) {
                    into[0] = 42
                    into[1] = 99
                    return 2
                },
            } as any

            let stream = yoroReadableToWeb(yoro)
            let reader = stream.getReader({ mode: "byob" })

            let { value, done } = await reader.read(new Uint8Array(8))
            expect(done).toBe(false)
            expect(value).toEqual(new Uint8Array([42, 99]))
        })

        it("falls back to enqueue path when no BYOB request", async () => {
            let yoro = {
                async read(into: Uint8Array) {
                    into.set([7, 8, 9])
                    return 3
                },
            } as any

            let stream = yoroReadableToWeb(yoro)
            let reader = stream.getReader()

            let { value, done } = await reader.read()
            expect(done).toBe(false)
            expect(value).toEqual(new Uint8Array([7, 8, 9]))
        })

        it("closes stream when yoro returns 0 bytes", async () => {
            let yoro = {
                async read() {
                    return 0
                },
            } as any

            let stream = yoroReadableToWeb(yoro)
            let reader = stream.getReader()

            let { done } = await reader.read()
            expect(done).toBe(true)
        })

        it("handles partial reads across multiple pull calls", async () => {
            let call = 0
            let yoro = {
                async read(into: Uint8Array) {
                    call++
                    if (call === 1) {
                        into.set([1, 2])
                        return 2
                    }
                    return 0
                },
            } as any

            let stream = yoroReadableToWeb(yoro)
            let reader = stream.getReader()

            let chunk1 = await reader.read()
            expect(chunk1.value).toEqual(new Uint8Array([1, 2]))
        })
    })

    it("full round-trip web → yoro → web preserves data", async () => {
        let original = new ReadableStream({
            start(c) {
                c.enqueue(new Uint8Array([10, 20, 30, 40]))
                c.close()
            },
        })

        let yoro = webReadableToYoro(original)
        let backToWeb = yoroReadableToWeb(yoro)

        let reader = backToWeb.getReader()
        let { value } = await reader.read()

        expect(value).toEqual(new Uint8Array([10, 20, 30, 40]))
    })
})
