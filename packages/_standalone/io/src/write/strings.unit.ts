import { beforeEach, describe, expect, it, vi } from "vitest"
import { bytes, bytesReversed, cUtf8String, rawString, utf16beString, utf16leString, utf8String } from "./strings"

interface SyncWritable {
    writeSync(size: number): Uint8Array
    disposeWriteSync(written?: number): void
}

class MockSyncWritable implements SyncWritable {
    writeSync = vi.fn((size: number) => new Uint8Array(size))
    disposeWriteSync = vi.fn()
}

describe("sync string writers", () => {
    let w: MockSyncWritable

    beforeEach(() => {
        vi.clearAllMocks()
        w = new MockSyncWritable()
    })

    it("bytes writes exact data and calls dispose", () => {
        const data = new Uint8Array([0x01, 0x02, 0x03, 0xff])
        bytes(w, data)

        expect(w.writeSync).toHaveBeenCalledOnce()
        expect(w.writeSync).toHaveBeenCalledWith(4)

        const buffer = w.writeSync.mock.results[0].value
        expect(buffer).toEqual(data)

        expect(w.disposeWriteSync).toHaveBeenCalledOnce()
        expect(w.disposeWriteSync).toHaveBeenCalledWith()
    })

    it("bytesReversed reverses data in-place before dispose", () => {
        const data = new Uint8Array([0x11, 0x22, 0x33, 0x44])
        bytesReversed(w, data)

        const buffer = w.writeSync.mock.results[0].value
        expect(buffer).toEqual(new Uint8Array([0x44, 0x33, 0x22, 0x11]))
        expect(w.disposeWriteSync).toHaveBeenCalledOnce()
    })

    it("rawString writes ASCII bytes", () => {
        rawString(w, "Hello")

        const buffer = w.writeSync.mock.results[0].value
        expect(buffer).toEqual(new Uint8Array([72, 101, 108, 108, 111]))
        expect(w.disposeWriteSync).toHaveBeenCalledOnce()
    })

    it("utf8String uses utf8.encoder.encodeInto", () => {
        utf8String(w, "こんにちは")

        expect(w.writeSync).toHaveBeenCalledWith(15)
        const buffer = w.writeSync.mock.results[0].value
        expect(buffer).toEqual(
            new Uint8Array([0xe3, 0x81, 0x93, 0xe3, 0x82, 0x93, 0xe3, 0x81, 0xab, 0xe3, 0x81, 0xa1, 0xe3, 0x81, 0xaf]),
        )
        expect(w.disposeWriteSync).toHaveBeenCalledOnce()
    })

    it("utf16beString writes big-endian UTF-16", () => {
        utf16beString(w, "Hi")

        const buffer = w.writeSync.mock.results[0].value
        expect(buffer).toEqual(new Uint8Array([0x00, 0x48, 0x00, 0x69]))
        expect(w.disposeWriteSync).toHaveBeenCalledOnce()
    })

    it("utf16leString writes little-endian UTF-16", () => {
        utf16leString(w, "Hi")

        const buffer = w.writeSync.mock.results[0].value
        expect(buffer).toEqual(new Uint8Array([0x48, 0x00, 0x69, 0x00]))
        expect(w.disposeWriteSync).toHaveBeenCalledOnce()
    })

    it("cUtf8String appends null terminator", () => {
        cUtf8String(w, "ABC")

        expect(w.writeSync).toHaveBeenCalledWith(4)
        const buffer = w.writeSync.mock.results[0].value
        expect(buffer).toEqual(new Uint8Array([65, 66, 67, 0]))
        expect(w.disposeWriteSync).toHaveBeenCalledOnce()
    })

    it("handles empty input gracefully", () => {
        bytes(w, new Uint8Array(0))
        expect(w.writeSync).toHaveBeenCalledWith(0)
        expect(w.disposeWriteSync).toHaveBeenCalledOnce()

        rawString(w, "")
        expect(w.writeSync).toHaveBeenCalledWith(0)

        utf8String(w, "")
        expect(w.writeSync).toHaveBeenCalledWith(0)

        cUtf8String(w, "")
        expect(w.writeSync).toHaveBeenCalledWith(1)
        expect(w.writeSync.mock.results.at(-1)!.value).toEqual(new Uint8Array([0]))
    })

    it("utf16* functions reject odd lengths internally (via writeSync)", () => {
        utf16beString(w, "A")
        expect(w.writeSync).toHaveBeenCalledWith(2)
    })
})
