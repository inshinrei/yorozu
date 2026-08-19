import { u8 } from "../arrays"
import { byteCeil, writeBits, writeBits16 } from "./bits"
import { StreamFinishedError } from "./errors"
import { buildEncodeMap, buildLengthLimitedTree } from "./huffman"
import {
    codeLengthOrder,
    distanceReverse,
    fixedDistanceExtraBits,
    fixedDistanceLengths,
    fixedLengthExtraBits,
    fixedLiteralLengths,
    lengthReverse,
} from "./tables"
import type { CompressOptions } from "./types"

export type DeflateState = {
    head?: Uint16Array
    prev?: Uint16Array
    index?: number
    end?: number
    wait?: number
    remainder?: number
    last: number
}

// (nice << 13) | chain for levels 1-9
const levelOptions = new Int32Array([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632])

let empty = u8.empty
let fixedLiteralEncode = /*#__PURE__*/ buildEncodeMap(fixedLiteralLengths, 9)
let fixedDistanceEncode = /*#__PURE__*/ buildEncodeMap(fixedDistanceLengths, 5)

function copySlice(buffer: Uint8Array, start: number, end?: number): Uint8Array {
    if (start < 0) start = 0
    if (end == null || end > buffer.length) end = buffer.length
    return new Uint8Array(buffer.subarray(start, end))
}

function encodedSize(freqs: Uint16Array, lengths: Uint8Array): number {
    let bits = 0
    for (let i = 0; i < lengths.length; i++) bits += freqs[i] * lengths[i]
    return bits
}

function runLengthCodeLengths(lengths: Uint8Array): { codes: Uint16Array; used: number } {
    let end = lengths.length
    while (end && !lengths[--end]);
    let packed = new Uint16Array(++end)
    let count = 0
    let value = lengths[0]
    let run = 1
    let write = (code: number): void => {
        packed[count++] = code
    }
    for (let i = 1; i <= end; i++) {
        if (lengths[i] === value && i !== end) {
            run++
        } else {
            if (!value && run > 2) {
                for (; run > 138; run -= 138) write(32754)
                if (run > 2) {
                    write(run > 10 ? ((run - 11) << 5) | 28690 : ((run - 3) << 5) | 12305)
                    run = 0
                }
            } else if (run > 3) {
                write(value)
                run--
                for (; run > 6; run -= 6) write(8304)
                if (run > 2) {
                    write(((run - 3) << 5) | 8208)
                    run = 0
                }
            }
            while (run--) write(value)
            run = 1
            value = lengths[i]
        }
    }
    return { codes: packed.subarray(0, count), used: end }
}

function writeStoredBlock(out: Uint8Array, bitPos: number, data: Uint8Array): number {
    let length = data.length
    let offset = byteCeil(bitPos + 2)
    out[offset] = length & 255
    out[offset + 1] = length >> 8
    out[offset + 2] = out[offset] ^ 255
    out[offset + 3] = out[offset + 1] ^ 255
    out.set(data, offset + 4)
    return (offset + 4 + length) * 8
}

function writeBlock(
    data: Uint8Array,
    out: Uint8Array,
    final: number,
    symbols: Int32Array,
    literalFreq: Uint16Array,
    distanceFreq: Uint16Array,
    extraBits: number,
    symbolCount: number,
    blockStart: number,
    blockLength: number,
    bitPos: number,
): number {
    writeBits(out, bitPos++, final)
    literalFreq[256]++
    let literalTree = buildLengthLimitedTree(literalFreq, 15)
    let distanceTree = buildLengthLimitedTree(distanceFreq, 15)
    let literalRuns = runLengthCodeLengths(literalTree.lengths)
    let distanceRuns = runLengthCodeLengths(distanceTree.lengths)
    let codeLengthFreq = new Uint16Array(19)
    for (let i = 0; i < literalRuns.codes.length; i++) codeLengthFreq[literalRuns.codes[i] & 31]++
    for (let i = 0; i < distanceRuns.codes.length; i++) codeLengthFreq[distanceRuns.codes[i] & 31]++
    let codeLengthTree = buildLengthLimitedTree(codeLengthFreq, 7)
    let codeLengthCount = 19
    while (codeLengthCount > 4 && !codeLengthTree.lengths[codeLengthOrder[codeLengthCount - 1]]) codeLengthCount--

    let storedBits = (blockLength + 5) << 3
    let fixedBits = encodedSize(literalFreq, fixedLiteralLengths) + encodedSize(distanceFreq, fixedDistanceLengths) + extraBits
    let dynamicBits =
        encodedSize(literalFreq, literalTree.lengths) +
        encodedSize(distanceFreq, distanceTree.lengths) +
        extraBits +
        14 +
        3 * codeLengthCount +
        encodedSize(codeLengthFreq, codeLengthTree.lengths) +
        2 * codeLengthFreq[16] +
        3 * codeLengthFreq[17] +
        7 * codeLengthFreq[18]

    if (blockStart >= 0 && storedBits <= fixedBits && storedBits <= dynamicBits) {
        return writeStoredBlock(out, bitPos, data.subarray(blockStart, blockStart + blockLength))
    }

    let literalMap: Uint16Array
    let literalLengths: Uint8Array
    let distanceMap: Uint16Array
    let distanceLengths: Uint8Array
    writeBits(out, bitPos, 1 + (dynamicBits < fixedBits ? 1 : 0))
    bitPos += 2

    if (dynamicBits < fixedBits) {
        literalMap = buildEncodeMap(literalTree.lengths, literalTree.maxBits)
        literalLengths = literalTree.lengths
        distanceMap = buildEncodeMap(distanceTree.lengths, distanceTree.maxBits)
        distanceLengths = distanceTree.lengths
        let codeLengthMap = buildEncodeMap(codeLengthTree.lengths, codeLengthTree.maxBits)
        writeBits(out, bitPos, literalRuns.used - 257)
        writeBits(out, bitPos + 5, distanceRuns.used - 1)
        writeBits(out, bitPos + 10, codeLengthCount - 4)
        bitPos += 14
        for (let i = 0; i < codeLengthCount; i++) writeBits(out, bitPos + 3 * i, codeLengthTree.lengths[codeLengthOrder[i]])
        bitPos += 3 * codeLengthCount
        let runs = [literalRuns.codes, distanceRuns.codes]
        for (let set = 0; set < 2; set++) {
            let codes = runs[set]
            for (let i = 0; i < codes.length; i++) {
                let symbol = codes[i] & 31
                writeBits(out, bitPos, codeLengthMap[symbol])
                bitPos += codeLengthTree.lengths[symbol]
                if (symbol > 15) {
                    writeBits(out, bitPos, (codes[i] >> 5) & 127)
                    bitPos += codes[i] >> 12
                }
            }
        }
    } else {
        literalMap = fixedLiteralEncode
        literalLengths = fixedLiteralLengths
        distanceMap = fixedDistanceEncode
        distanceLengths = fixedDistanceLengths
    }

    for (let i = 0; i < symbolCount; i++) {
        let symbol = symbols[i]
        if (symbol > 255) {
            let lengthIndex = (symbol >> 18) & 31
            writeBits16(out, bitPos, literalMap[lengthIndex + 257])
            bitPos += literalLengths[lengthIndex + 257]
            if (lengthIndex > 7) {
                writeBits(out, bitPos, (symbol >> 23) & 31)
                bitPos += fixedLengthExtraBits[lengthIndex]
            }
            let distanceIndex = symbol & 31
            writeBits16(out, bitPos, distanceMap[distanceIndex])
            bitPos += distanceLengths[distanceIndex]
            if (distanceIndex > 3) {
                writeBits16(out, bitPos, (symbol >> 5) & 8191)
                bitPos += fixedDistanceExtraBits[distanceIndex]
            }
        } else {
            writeBits16(out, bitPos, literalMap[symbol])
            bitPos += literalLengths[symbol]
        }
    }
    writeBits16(out, bitPos, literalMap[256])
    return bitPos + literalLengths[256]
}

function deflateRaw(
    data: Uint8Array,
    level: number,
    hashBits: number,
    pre: number,
    post: number,
    state: DeflateState,
): Uint8Array {
    let size = state.end || data.length
    let out = new Uint8Array(pre + size + 5 * (1 + Math.ceil(size / 7000)) + post)
    let dest = out.subarray(pre, out.length - post)
    let last = state.last
    let pos = (state.remainder || 0) & 7

    if (level) {
        if (pos) dest[0] = state.remainder! >> 3
        let opt = levelOptions[level - 1]
        let nice = opt >> 13
        let chain = opt & 8191
        let mask = (1 << hashBits) - 1
        let prev = state.prev || new Uint16Array(32768)
        let head = state.head || new Uint16Array(mask + 1)
        let shift1 = Math.ceil(hashBits / 3)
        let shift2 = 2 * shift1
        let hashAt = (i: number): number => (data[i] ^ (data[i + 1] << shift1) ^ (data[i + 2] << shift2)) & mask
        let symbols = new Int32Array(25000)
        let literalFreq = new Uint16Array(288)
        let distanceFreq = new Uint16Array(32)
        let matches = 0
        let extraBits = 0
        let i = state.index || 0
        let symbolCount = 0
        let wait = state.wait || 0
        let blockStart = 0

        for (; i + 2 < size; i++) {
            let hv = hashAt(i)
            let imod = i & 32767
            let previous = head[hv]
            prev[imod] = previous
            head[hv] = imod
            if (wait <= i) {
                let remaining = size - i
                if ((matches > 7000 || symbolCount > 24576) && (remaining > 423 || !last)) {
                    pos = writeBlock(data, dest, 0, symbols, literalFreq, distanceFreq, extraBits, symbolCount, blockStart, i - blockStart, pos)
                    symbolCount = matches = extraBits = 0
                    blockStart = i
                    literalFreq.fill(0)
                    distanceFreq.fill(0)
                }
                let bestLen = 2
                let bestDist = 0
                let tries = chain
                let dist = (imod - previous) & 32767
                if (remaining > 2 && hv === hashAt(i - dist)) {
                    let niceLen = Math.min(nice, remaining) - 1
                    let maxDist = Math.min(32767, i)
                    let maxLen = Math.min(258, remaining)
                    while (dist <= maxDist && --tries && imod !== previous) {
                        if (data[i + bestLen] === data[i + bestLen - dist]) {
                            let len = 0
                            for (; len < maxLen && data[i + len] === data[i + len - dist]; len++);
                            if (len > bestLen) {
                                bestLen = len
                                bestDist = dist
                                if (len > niceLen) break
                                let search = Math.min(dist, len - 2)
                                let rarest = 0
                                for (let j = 0; j < search; j++) {
                                    let ti = (i - dist + j) & 32767
                                    let pti = prev[ti]
                                    let candidate = (ti - pti) & 32767
                                    if (candidate > rarest) {
                                        rarest = candidate
                                        previous = ti
                                    }
                                }
                            }
                        }
                        imod = previous
                        previous = prev[imod]
                        dist += (imod - previous) & 32767
                    }
                }
                if (bestDist) {
                    symbols[symbolCount++] = 268435456 | (lengthReverse[bestLen] << 18) | distanceReverse[bestDist]
                    let lengthIndex = lengthReverse[bestLen] & 31
                    let distanceIndex = distanceReverse[bestDist] & 31
                    extraBits += fixedLengthExtraBits[lengthIndex] + fixedDistanceExtraBits[distanceIndex]
                    literalFreq[257 + lengthIndex]++
                    distanceFreq[distanceIndex]++
                    wait = i + bestLen
                    matches++
                } else {
                    symbols[symbolCount++] = data[i]
                    literalFreq[data[i]]++
                }
            }
        }
        for (i = Math.max(i, wait); i < size; i++) {
            symbols[symbolCount++] = data[i]
            literalFreq[data[i]]++
        }
        pos = writeBlock(data, dest, last, symbols, literalFreq, distanceFreq, extraBits, symbolCount, blockStart, i - blockStart, pos)
        if (!last) {
            state.remainder = (pos & 7) | (dest[(pos / 8) | 0] << 3)
            pos -= 7
            state.head = head
            state.prev = prev
            state.index = i
            state.wait = wait
        }
    } else {
        for (let i = state.wait || 0; i < size + last; i += 65535) {
            let end = i + 65535
            if (end >= size) {
                dest[(pos / 8) | 0] = last
                end = size
            }
            pos = writeStoredBlock(dest, pos + 1, data.subarray(i, end))
        }
        state.index = size
    }

    return copySlice(out, 0, pre + byteCeil(pos) + post)
}

function defaultHashBits(length: number, last: number): number {
    if (!last) return 20
    return Math.ceil(Math.max(8, Math.min(13, Math.log(Math.max(length, 1)))) * 1.5)
}

export function deflateWithOptions(
    data: Uint8Array,
    options: CompressOptions,
    pre: number,
    post: number,
    state?: DeflateState,
): Uint8Array {
    if (!state) {
        state = { last: 1 }
        if (options.dictionary) {
            let dict = options.dictionary.subarray(-32768)
            let prefixed = new Uint8Array(dict.length + data.length)
            prefixed.set(dict)
            prefixed.set(data, dict.length)
            data = prefixed
            state.wait = dict.length
        }
    }
    let level = options.level == null ? 6 : options.level
    let hashBits = options.mem == null ? defaultHashBits(data.length, state.last) : 12 + options.mem
    return deflateRaw(data, level, hashBits, pre, post, state)
}

export function compress(data: Uint8Array, options: CompressOptions = {}): Uint8Array {
    return deflateWithOptions(data, options, 0, 0)
}

export class Compressor {
    protected _options: CompressOptions
    protected _state: DeflateState
    protected _buffer: Uint8Array
    protected _done = false

    constructor(options: CompressOptions = {}) {
        this._options = options
        this._state = { last: 0, index: 32768, wait: 32768, end: 32768 }
        this._buffer = new Uint8Array(98304)
        if (options.dictionary) {
            let dict = options.dictionary.subarray(-32768)
            this._buffer.set(dict, 32768 - dict.length)
            this._state.index = 32768 - dict.length
        }
    }

    protected _emit(final: boolean): Uint8Array {
        return deflateWithOptions(this._buffer, this._options, 0, 0, this._state)
    }

    push(chunk: Uint8Array, final?: boolean): Uint8Array {
        if (this._done) throw new StreamFinishedError()
        let endLen = chunk.length + this._state.end!
        if (endLen > this._buffer.length) {
            if (endLen > 2 * this._buffer.length - 32768) {
                let next = new Uint8Array(endLen & -32768)
                next.set(this._buffer.subarray(0, this._state.end))
                this._buffer = next
            }
            let split = this._buffer.length - this._state.end!
            this._buffer.set(chunk.subarray(0, split), this._state.end)
            this._state.end = this._buffer.length
            let first = this._emit(false)
            this._buffer.set(this._buffer.subarray(-32768))
            this._buffer.set(chunk.subarray(split), 32768)
            this._state.end = chunk.length - split + 32768
            this._state.index = 32766
            this._state.wait = 32768
            this._state.last = final ? 1 : 0
            let rest: Uint8Array = new Uint8Array(0)
            if (this._state.end > this._state.wait + 8191 || final) {
                rest = this._emit(!!final)
                this._state.wait = this._state.index
                this._state.index! -= 2
            }
            if (final) {
                this._done = true
                this._buffer = empty
                this._state = { last: 1 }
            }
            if (!rest.length) return first
            let joined = new Uint8Array(first.length + rest.length)
            joined.set(first)
            joined.set(rest, first.length)
            return joined
        }

        this._buffer.set(chunk, this._state.end)
        this._state.end! += chunk.length
        this._state.last = final ? 1 : 0
        let out: Uint8Array = u8.empty
        if (this._state.end! > this._state.wait! + 8191 || final) {
            out = this._emit(!!final)
            this._state.wait = this._state.index
            this._state.index! -= 2
        }
        if (final) {
            this._done = true
            this._buffer = empty
            this._state = { last: 1 }
        }
        return out
    }

    flush(sync?: boolean): Uint8Array {
        if (this._done) throw new StreamFinishedError()
        let out = this._emit(false)
        this._state.wait = this._state.index
        this._state.index! -= 2
        if (!sync) return out
        let block = new Uint8Array(6)
        block[0] = this._state.remainder! >> 3
        let end = writeStoredBlock(block, this._state.remainder!, empty)
        this._state.remainder = 0
        let trailer = block.subarray(0, end >> 3)
        if (!out.length) return new Uint8Array(trailer)
        let joined = new Uint8Array(out.length + trailer.length)
        joined.set(out)
        joined.set(trailer, out.length)
        return joined
    }
}
