import { describe, expect, it } from "vitest"
import { isByobCapableStream } from "./streams"

describe("isByobCapableStream", () => {
    it("returns true for BYOB-capable bytes streams", () => {
        let stream = new ReadableStream({
            type: "bytes",
            start(c) {
                c.close()
            },
        })

        expect(isByobCapableStream(stream)).toBe(true)
    })

    it("returns false for regular non-bytes ReadableStreams", () => {
        let stream = new ReadableStream({
            start(c) {
                c.close()
            },
        })

        expect(isByobCapableStream(stream)).toBe(false)
    })

    it("returns false for streams created from iterables", () => {
        let stream = (ReadableStream as any).from([new Uint8Array([1, 2, 3])])
        expect(isByobCapableStream(stream)).toBe(false)
    })

    it("re-throws non-TypeError errors", () => {
        let badStream = {
            getReader() {
                throw new Error("custom stream error")
            },
        } as any

        expect(() => isByobCapableStream(badStream)).toThrow("custom stream error")
    })

    it("does not leave the reader locked after successful check", () => {
        let stream = new ReadableStream({ type: "bytes" })

        isByobCapableStream(stream)

        let reader = stream.getReader()
        expect(reader).toBeDefined()
        reader.releaseLock()
    })

    it("returns false for null or undefined (defensive runtime behavior)", () => {
        expect(isByobCapableStream(null as any)).toBe(false)
        expect(isByobCapableStream(undefined as any)).toBe(false)
    })
})
