import { u8 } from "../arrays"
import { byteCeil, readBits, readBits16 } from "./bits"
import {
    InvalidBlockTypeError,
    InvalidDistanceError,
    InvalidLengthLiteralError,
    StreamFinishedError,
    UnexpectedEofError,
} from "./errors"
import { buildDecodeMap } from "./huffman"
import {
    codeLengthOrder,
    distanceBase,
    fixedDistanceExtraBits,
    fixedDistanceLengths,
    fixedLengthExtraBits,
    fixedLiteralLengths,
    lengthBase,
} from "./tables"
import type { DecompressOptions } from "./types"

export type InflateState = {
    lengthMap?: Uint16Array
    distanceMap?: Uint16Array
    lengthBits?: number
    distanceBits?: number
    final?: number
    bitPos?: number
    outputLength?: number
    mode: number
}

let fixedLengthMap = /*#__PURE__*/ buildDecodeMap(fixedLiteralLengths, 9)
let fixedDistanceMap = /*#__PURE__*/ buildDecodeMap(fixedDistanceLengths, 5)

function copySlice(buffer: Uint8Array, start: number, end?: number): Uint8Array {
    if (start < 0) start = 0
    if (end == null || end > buffer.length) end = buffer.length
    return new Uint8Array(buffer.subarray(start, end))
}

function maxValue(values: Uint8Array): number {
    let max = values[0]
    for (let i = 1; i < values.length; i++) {
        if (values[i] > max) max = values[i]
    }
    return max
}

export function inflateRaw(
    data: Uint8Array,
    state: InflateState,
    buf?: Uint8Array,
    dictionary?: Uint8Array,
): Uint8Array {
    let sourceLength = data.length
    let dictLength = dictionary ? dictionary.length : 0
    if (!sourceLength || (state.final && !state.lengthMap)) return buf || u8.empty

    let noBuf = !buf
    let resize = noBuf || state.mode !== 2
    let throwOnEof = state.mode !== 0
    if (noBuf) buf = new Uint8Array(sourceLength * 3)

    let ensure = (need: number): void => {
        if (need <= buf!.length) return
        let next = new Uint8Array(Math.max(buf!.length * 2, need))
        next.set(buf!)
        buf = next
    }

    let final = state.final || 0
    let pos = state.bitPos || 0
    let written = state.outputLength || 0
    let lengthMap = state.lengthMap
    let distanceMap = state.distanceMap
    let lengthBits = state.lengthBits
    let distanceBits = state.distanceBits
    let totalBits = sourceLength * 8

    do {
        if (!lengthMap) {
            final = readBits(data, pos, 1)
            let type = readBits(data, pos + 1, 3)
            pos += 3
            if (!type) {
                let start = byteCeil(pos) + 4
                let length = data[start - 4] | (data[start - 3] << 8)
                let end = start + length
                if (end > sourceLength) {
                    if (throwOnEof) throw new UnexpectedEofError()
                    break
                }
                if (resize) ensure(written + length)
                let room = buf!.length - written
                if (room > 0) buf!.set(data.subarray(start, start + Math.min(length, room)), written)
                state.outputLength = written += length
                state.bitPos = pos = end * 8
                state.final = final
                continue
            } else if (type === 1) {
                lengthMap = fixedLengthMap
                distanceMap = fixedDistanceMap
                lengthBits = 9
                distanceBits = 5
            } else if (type === 2) {
                let literalCount = readBits(data, pos, 31) + 257
                let distanceCount = readBits(data, pos + 5, 31) + 1
                let codeLengthCount = readBits(data, pos + 10, 15) + 4
                let totalCodes = literalCount + distanceCount
                pos += 14
                let lengths = new Uint8Array(totalCodes)
                let codeLengthTree = new Uint8Array(19)
                for (let i = 0; i < codeLengthCount; i++) {
                    codeLengthTree[codeLengthOrder[i]] = readBits(data, pos + i * 3, 7)
                }
                pos += codeLengthCount * 3
                let codeLengthBits = maxValue(codeLengthTree)
                let codeLengthMask = (1 << codeLengthBits) - 1
                let codeLengthMap = buildDecodeMap(codeLengthTree, codeLengthBits)
                for (let i = 0; i < totalCodes; ) {
                    let entry = codeLengthMap[readBits(data, pos, codeLengthMask)]
                    pos += entry & 15
                    let symbol = entry >> 4
                    if (symbol < 16) {
                        lengths[i++] = symbol
                    } else {
                        let fill = 0
                        let count = 0
                        if (symbol === 16) {
                            count = 3 + readBits(data, pos, 3)
                            pos += 2
                            fill = lengths[i - 1]
                        } else if (symbol === 17) {
                            count = 3 + readBits(data, pos, 7)
                            pos += 3
                        } else if (symbol === 18) {
                            count = 11 + readBits(data, pos, 127)
                            pos += 7
                        }
                        while (count--) lengths[i++] = fill
                    }
                }
                let literalLengths = lengths.subarray(0, literalCount)
                let distanceLengths = lengths.subarray(literalCount)
                lengthBits = maxValue(literalLengths)
                distanceBits = maxValue(distanceLengths)
                lengthMap = buildDecodeMap(literalLengths, lengthBits)
                distanceMap = buildDecodeMap(distanceLengths, distanceBits)
            } else {
                throw new InvalidBlockTypeError()
            }
            if (pos > totalBits) {
                if (throwOnEof) throw new UnexpectedEofError()
                break
            }
        }

        if (resize) ensure(written + 131072)
        let lengthMask = (1 << lengthBits!) - 1
        let distanceMask = (1 << distanceBits!) - 1
        let lastPos = pos

        for (;; lastPos = pos) {
            let entry = lengthMap![readBits16(data, pos) & lengthMask]
            let symbol = entry >> 4
            pos += entry & 15
            if (pos > totalBits) {
                if (throwOnEof) throw new UnexpectedEofError()
                break
            }
            if (!entry) throw new InvalidLengthLiteralError()
            if (symbol < 256) {
                if (written < buf!.length) buf![written] = symbol
                written++
            } else if (symbol === 256) {
                lastPos = pos
                lengthMap = undefined
                break
            } else {
                let add = symbol - 254
                if (symbol > 264) {
                    let index = symbol - 257
                    let extra = fixedLengthExtraBits[index]
                    add = readBits(data, pos, (1 << extra) - 1) + lengthBase[index]
                    pos += extra
                }
                let distEntry = distanceMap![readBits16(data, pos) & distanceMask]
                let distSymbol = distEntry >> 4
                if (!distEntry) throw new InvalidDistanceError()
                pos += distEntry & 15
                let distance = distanceBase[distSymbol]
                if (distSymbol > 3) {
                    let extra = fixedDistanceExtraBits[distSymbol]
                    distance += readBits16(data, pos) & ((1 << extra) - 1)
                    pos += extra
                }
                if (pos > totalBits) {
                    if (throwOnEof) throw new UnexpectedEofError()
                    break
                }
                if (resize) ensure(written + 131072)
                let end = written + add
                if (written < distance) {
                    let shift = dictLength - distance
                    let dictEnd = Math.min(distance, end)
                    if (shift + written < 0) throw new InvalidDistanceError()
                    for (; written < dictEnd; written++) {
                        if (written < buf!.length) buf![written] = dictionary![shift + written]
                    }
                }
                for (; written < end; written++) {
                    if (written < buf!.length) buf![written] = buf![written - distance]
                }
            }
        }

        state.lengthMap = lengthMap
        state.bitPos = lastPos
        state.outputLength = written
        state.final = final
        if (lengthMap) {
            final = 1
            state.lengthBits = lengthBits
            state.distanceMap = distanceMap
            state.distanceBits = distanceBits
        }
    } while (!final)

    let length = Math.min(written, buf!.length)
    if (length === buf!.length) return buf!
    return noBuf ? copySlice(buf!, 0, length) : buf!.subarray(0, length)
}

export function decompress(data: Uint8Array, options?: DecompressOptions): Uint8Array {
    return inflateRaw(data, { mode: 2 }, options?.out, options?.dictionary)
}

export class Decompressor {
    protected _state: InflateState
    protected _window: Uint8Array
    protected _pending: Uint8Array
    protected _done = false

    constructor(options?: DecompressOptions) {
        let dict = options?.dictionary?.subarray(-32768)
        this._state = { mode: 0, outputLength: dict ? dict.length : 0 }
        this._window = new Uint8Array(32768)
        this._pending = u8.empty
        if (dict) this._window.set(dict)
    }

    push(chunk: Uint8Array, final?: boolean): Uint8Array {
        if (this._done) throw new StreamFinishedError()
        if (!this._pending.length) this._pending = chunk
        else if (chunk.length) {
            let next = new Uint8Array(this._pending.length + chunk.length)
            next.set(this._pending)
            next.set(chunk, this._pending.length)
            this._pending = next
        }

        this._done = !!final
        this._state.mode = this._done ? 1 : 0
        let start = this._state.outputLength || 0
        let out = inflateRaw(this._pending, this._state, this._window)
        let produced = copySlice(out, start, this._state.outputLength)
        this._window = copySlice(out, (this._state.outputLength || 0) - 32768)
        this._state.outputLength = this._window.length
        this._pending = copySlice(this._pending, ((this._state.bitPos || 0) / 8) | 0)
        this._state.bitPos = (this._state.bitPos || 0) & 7
        return produced.length ? produced : u8.empty
    }
}
