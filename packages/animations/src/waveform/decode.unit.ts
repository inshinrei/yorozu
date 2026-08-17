import { describe, expect, it } from "vitest"
import { decodeWaveform, fitWaveform } from "./decode"

function encode5bit(values: number[]): Uint8Array {
    let bitCount = values.length * 5
    let bytes = new Uint8Array(Math.ceil(bitCount / 8))
    for (let i = 0; i < values.length; i++) {
        let v = values[i]! & 0x1f
        let bitOffset = i * 5
        for (let b = 0; b < 5; b++) {
            if ((v & (1 << b)) === 0) continue
            let idx = Math.floor((bitOffset + b) / 8)
            let shift = (bitOffset + b) % 8
            bytes[idx]! |= 1 << shift
        }
    }
    return bytes
}

describe("decodeWaveform", () => {
    it("returns empty for an empty payload", () => {
        expect(decodeWaveform(new Uint8Array())).toEqual([])
    })

    it("reads packed 5-bit samples", () => {
        let values = decodeWaveform(new Uint8Array([0b00011111, 0]))
        expect(values[0]).toBe(31)
    })

    it("decodes a multi-sample 5-bit stream", () => {
        let packed = encode5bit([1, 2, 3, 4, 31])
        expect(decodeWaveform(packed).slice(0, 5)).toEqual([1, 2, 3, 4, 31])
    })
})

describe("fitWaveform", () => {
    it("resamples to the requested bar count", () => {
        expect(fitWaveform([0, 10, 20, 30], 2)).toEqual([0, 20])
        expect(fitWaveform([0, 10, 20, 30], 4)).toEqual([0, 10, 20, 30])
        expect(fitWaveform([5], 3)).toEqual([5, 5, 5])
    })

    it("returns zeros when data is empty", () => {
        expect(fitWaveform([], 4)).toEqual([0, 0, 0, 0])
    })

    it("returns empty when the fit count is 0", () => {
        expect(fitWaveform([1, 2, 3], 0)).toEqual([])
        expect(fitWaveform([1, 2, 3], -2)).toEqual([])
    })
})
