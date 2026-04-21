import { beforeEach, describe, expect, it } from "vitest"
import {
    cUtf8String,
    exactly,
    lengthPrefixed,
    rawString,
    untilCondition,
    untilEnd,
    untilZero,
    utf16beString,
    utf16leString,
    utfString
} from "./strings"
import { PartialReadError } from "../errors"

class MockSyncReadable {
    #data: Uint8Array
    #pos = 0

    constructor(data: Uint8Array) {
        this.#data = data
    }

    readSync(size: number): Uint8Array {
        if (this.#pos >= this.#data.length) return new Uint8Array(0)
        const n = Math.min(size, this.#data.length - this.#pos)
        const slice = this.#data.subarray(this.#pos, this.#pos + n)
        this.#pos += n
        return slice
    }
}

describe("sync string parsers", () => {
    let r: MockSyncReadable

    beforeEach(() => {
        r = new MockSyncReadable(new Uint8Array(0))
    })

    it("exactly succeeds and returns exact slice", () => {
        r = new MockSyncReadable(new Uint8Array([1, 2, 3, 4, 5]))
        expect(exactly(r, 5)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    })

    it("rawString builds string from bytes", () => {
        r = new MockSyncReadable(new Uint8Array([72, 101, 108, 108, 111]))
        expect(rawString(r, 5)).toBe("Hello")
    })

    it("rawString accepts Uint8Array directly", () => {
        expect(rawString(new Uint8Array([65, 66, 67]), 3)).toBe("ABC")
    })

    it("utfString uses utf8.decoder", () => {
        r = new MockSyncReadable(
            new Uint8Array([0xe3, 0x81, 0x93, 0xe3, 0x82, 0x93, 0xe3, 0x81, 0xab, 0xe3, 0x81, 0xa1, 0xe3, 0x81, 0xaf]),
        )
        expect(utfString(r, 15)).toBe("こんにちは")
    })

    it("utf16beString / utf16leString round-trip correctly", () => {
        const be = new Uint8Array([0x00, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f])
        expect(utf16beString(be, 10)).toBe("Hello")

        const le = new Uint8Array([0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00])
        expect(utf16leString(le, 10)).toBe("Hello")
    })

    it("utf16* throws on odd byteLength", () => {
        expect(() => utf16beString(new Uint8Array(3), 3)).toThrow("utf16beString: byteLength must be even")
        expect(() => utf16leString(new Uint8Array(1), 1)).toThrow("utf16leString: byteLength must be even")
    })

    it("untilCondition stops when predicate returns true", () => {
        r = new MockSyncReadable(new Uint8Array([1, 2, 3, 0, 4, 5]))
        expect(untilCondition(r, (b) => b === 0)).toEqual(new Uint8Array([1, 2, 3, 0]))
    })

    it("untilCondition throws PartialReadError on EOF before condition", () => {
        r = new MockSyncReadable(new Uint8Array([1, 2, 3]))
        expect(() => untilCondition(r, (b) => b === 0)).toThrow(PartialReadError)
    })

    it("untilEnd drains everything", () => {
        r = new MockSyncReadable(new Uint8Array([1, 2, 3, 4, 5]))
        expect(untilEnd(r)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
    })

    it("untilEnd respects custom chunkSize", () => {
        r = new MockSyncReadable(new Uint8Array(3000))
        expect(untilEnd(r, 1024).length).toBe(3000)
    })

    it("untilZero is sugar for null terminator", () => {
        r = new MockSyncReadable(new Uint8Array([72, 101, 108, 108, 111, 0, 42]))
        expect(untilZero(r)).toEqual(new Uint8Array([72, 101, 108, 108, 111, 0]))
    })

    it("cUtf8String strips trailing null", () => {
        r = new MockSyncReadable(new Uint8Array([72, 101, 108, 108, 111, 0]))
        expect(cUtf8String(r)).toBe("Hello")
    })

    it("lengthPrefixed reads length then exact payload", () => {
        const readLength = (r: any) => {
            const lenBuf = r.readSync(2)
            return (lenBuf[0] << 8) | lenBuf[1]
        }
        r = new MockSyncReadable(new Uint8Array([0x00, 0x03, 0xaa, 0xbb, 0xcc]))
        expect(lengthPrefixed(readLength, r)).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]))
    })

    it("full parser round-trip example", () => {
        const data = new Uint8Array([0x00, 0x05, 72, 101, 108, 108, 111, 0])
        r = new MockSyncReadable(data)

        const len = lengthPrefixed((r) => {
            const b = r.readSync(2)
            return (b[0] << 8) | b[1]
        }, r)

        expect(utfString(new MockSyncReadable(len), len.length)).toBe("Hello")
    })
})
