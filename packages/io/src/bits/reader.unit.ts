import { beforeEach, describe, expect, it } from "vitest"
import { BitReader } from "./reader"
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

describe("BitReader", () => {
    let reader: BitReader
    let mock: MockSyncReadable

    beforeEach(() => {
        mock = new MockSyncReadable(new Uint8Array(0))
        reader = new BitReader(mock)
    })

    it("starts aligned", () => {
        expect(reader.isAligned).toBe(true)
        expect(reader.bitPosition).toBe(0)
    })

    it("readSync when aligned forwards directly", () => {
        mock = new MockSyncReadable(new Uint8Array([0x11, 0x22, 0x33]))
        reader = new BitReader(mock)

        expect(reader.readSync(2)).toEqual(new Uint8Array([0x11, 0x22]))
        expect(reader.isAligned).toBe(true)
    })

    it("readSync when unaligned correctly shifts bits", () => {
        mock = new MockSyncReadable(new Uint8Array([0b10110011, 0b11110000]))
        reader = new BitReader(mock)

        reader.readBits(3)
        expect(reader.readSync(1)).toEqual(new Uint8Array([0b10011111]))
    })

    it("readBits small sizes within single byte", () => {
        mock = new MockSyncReadable(new Uint8Array([0b10110110]))
        reader = new BitReader(mock)

        expect(reader.readBits(3)).toBe(0b101)
        expect(reader.readBits(2)).toBe(0b10)
        expect(reader.readBits(3)).toBe(0b110)
        expect(reader.isAligned).toBe(true)
    })

    it("readBits crossing byte boundary", () => {
        mock = new MockSyncReadable(new Uint8Array([0b11110000, 0b00001111]))
        reader = new BitReader(mock)

        expect(reader.readBits(6)).toBe(0b111100)
        expect(reader.readBits(6)).toBe(0b000000)
        expect(reader.readBits(4)).toBe(0b1111)
    })

    it("readBitsBig handles large bit widths", () => {
        mock = new MockSyncReadable(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]))
        reader = new BitReader(mock)

        expect(reader.readBitsBig(64)).toBe(0xffffffffffffffffn)
    })

    it("skipBits byte-aligned path", () => {
        mock = new MockSyncReadable(new Uint8Array([0x11, 0x22, 0x33, 0x44]))
        reader = new BitReader(mock)

        reader.skipBits(16)
        expect(reader.isAligned).toBe(true)
        expect(reader.readSync(2)).toEqual(new Uint8Array([0x33, 0x44]))
    })

    it("skipBits bit-aligned path", () => {
        mock = new MockSyncReadable(new Uint8Array([0b10101010, 0b11001100]))
        reader = new BitReader(mock)

        reader.skipBits(5)
        expect(reader.bitPosition).toBe(5)
        expect(reader.readBits(3)).toBe(0b010)
    })

    it("readBits after skipBits", () => {
        mock = new MockSyncReadable(new Uint8Array([0b11110000, 0b00001111]))
        reader = new BitReader(mock)

        reader.skipBits(4)
        expect(reader.readBits(8)).toBe(0b00000000)
    })

    it("propagates PartialReadError from exactly", () => {
        mock = new MockSyncReadable(new Uint8Array([0x01]))
        reader = new BitReader(mock)

        expect(() => reader.readBits(16)).toThrow(PartialReadError)
    })
})
