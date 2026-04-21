import { beforeEach, describe, expect, it, vi } from "vitest"
import { webWritableToYoro, yoroSyncWritableToAsync, yoroWritableToWeb } from "./adapters"
import { Bytes } from "../bytes"

interface SyncWritable {
    writeSync(size: number): Uint8Array
    disposeWriteSync(written?: number): void
}

class MockSyncWritable implements SyncWritable {
    writeSync = vi.fn((size: number) => new Uint8Array(size))
    disposeWriteSync = vi.fn()
}

class MockWebWritableStream {
    getWriter = vi.fn(() => ({
        write: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
    }))
}

describe("writable stream adapters", () => {
    let syncWritable: MockSyncWritable

    beforeEach(() => {
        vi.clearAllMocks()
        syncWritable = new MockSyncWritable()
    })

    it("yoroSyncWritableToAsync forwards write and calls disposeWriteSync", async () => {
        const asyncWritable = yoroSyncWritableToAsync(syncWritable)
        const data = new Uint8Array([1, 2, 3, 4])

        await asyncWritable.write(data)

        expect(syncWritable.writeSync).toHaveBeenCalledOnce()
        expect(syncWritable.writeSync).toHaveBeenCalledWith(4)

        const buffer = syncWritable.writeSync.mock.results[0].value
        expect(buffer).toEqual(data)

        expect(syncWritable.disposeWriteSync).toHaveBeenCalledOnce()
        expect(syncWritable.disposeWriteSync).toHaveBeenCalledWith()
    })

    it("yoroSyncWritableToAsync works with real Bytes", async () => {
        const bytes = Bytes.allocate(32)
        const asyncWritable = yoroSyncWritableToAsync(bytes)

        const data = new Uint8Array([10, 20, 30])
        await asyncWritable.write(data)

        expect(bytes.result()).toEqual(data)
    })

    describe("webWritableToYoro", () => {
        let webStream: MockWebWritableStream
        let yoro: ReturnType<typeof webWritableToYoro>

        beforeEach(() => {
            webStream = new MockWebWritableStream()
            yoro = webWritableToYoro(webStream as any)
        })

        it("forwards write to web writer", async () => {
            const data = new Uint8Array([5, 6, 7])
            await yoro.write(data)

            const writer = webStream.getWriter.mock.results[0].value
            expect(writer.write).toHaveBeenCalledOnce()
            expect(writer.write).toHaveBeenCalledWith(data)
        })

        it("close() calls writer.close()", () => {
            yoro.close()

            const writer = webStream.getWriter.mock.results[0].value
            expect(writer.close).toHaveBeenCalledOnce()
        })
    })

    describe("yoroWritableToWeb", () => {
        let yoroWritable: any
        let webStream: any

        beforeEach(() => {
            yoroWritable = {
                write: vi.fn().mockResolvedValue(undefined),
            }
            webStream = yoroWritableToWeb(yoroWritable) as any
        })

        it("forwards write to yoro writable", async () => {
            const data = new Uint8Array([9, 8, 7])
            const writer = webStream.getWriter()

            await writer.write(data)

            expect(yoroWritable.write).toHaveBeenCalledOnce()
            expect(yoroWritable.write).toHaveBeenCalledWith(data)
        })

        it("close() calls yoro close() when available", async () => {
            const closeSpy = vi.fn()
            yoroWritable.close = closeSpy

            const writer = webStream.getWriter()
            await writer.close()

            expect(closeSpy).toHaveBeenCalledOnce()
        })

        it("close() is safe when yoro does not implement close", async () => {
            delete yoroWritable.close

            const writer = webStream.getWriter()
            await expect(writer.close()).resolves.not.toThrow()
        })

        it("full round-trip yoro → web → yoro preserves data", async () => {
            const bytes = Bytes.allocate(64)
            const web = yoroWritableToWeb(bytes)
            const writer = web.getWriter()

            const data = new Uint8Array([1, 2, 3, 4, 5])
            await writer.write(data)
            await writer.close()

            expect(bytes.result()).toEqual(data)
        })
    })
})
