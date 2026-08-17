import { u8 } from "../arrays"
import { byteCeil } from "./bits"
import { Adler32, adler32 } from "./checksum"
import { Compressor as RawCompressor, deflateWithOptions } from "./deflate"
import { ChecksumMismatchError, InvalidHeaderError, StreamFinishedError, UnexpectedEofError } from "./errors"
import { inflateRaw, type InflateState } from "./inflate"
import type { CompressOptions, DecompressOptions } from "./types"

function writeU32BE(buf: Uint8Array, offset: number, value: number): void {
    buf[offset] = value >>> 24
    buf[offset + 1] = value >>> 16
    buf[offset + 2] = value >>> 8
    buf[offset + 3] = value
}

function readU32BE(buf: Uint8Array, offset: number): number {
    return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0
}

function zlibHeaderSize(options: CompressOptions): number {
    return options.dictionary ? 6 : 2
}

function writeZlibHeader(out: Uint8Array, options: CompressOptions): void {
    let level = options.level ?? 6
    let flevel = level === 0 ? 0 : level < 6 ? 1 : level === 9 ? 3 : 2
    out[0] = 120
    out[1] = (flevel << 6) | (options.dictionary ? 32 : 0)
    out[1] += 31 - (((out[0] << 8) | out[1]) % 31)
    if (options.dictionary) writeU32BE(out, 2, adler32(options.dictionary))
}

export function zlibHeaderLength(data: Uint8Array, dictionary?: Uint8Array): number {
    if (data.length < 2) throw new UnexpectedEofError()
    if ((data[0] & 15) !== 8 || data[0] >> 4 > 7 || ((data[0] << 8) | data[1]) % 31 !== 0) {
        throw new InvalidHeaderError("Invalid zlib header.")
    }
    let hasDict = (data[1] >> 5) & 1
    if (hasDict && !dictionary) throw new InvalidHeaderError("zlib stream requires a dictionary.")
    if (!hasDict && dictionary) throw new InvalidHeaderError("zlib stream has no dictionary.")
    let size = hasDict ? 6 : 2
    if (data.length < size) throw new UnexpectedEofError()
    return size
}

export function compress(data: Uint8Array, options: CompressOptions = {}): Uint8Array {
    let header = zlibHeaderSize(options)
    let out = deflateWithOptions(data, options, header, 4)
    writeZlibHeader(out, options)
    writeU32BE(out, out.length - 4, adler32(data))
    return out
}

export function decompress(data: Uint8Array, options?: DecompressOptions): Uint8Array {
    let header = zlibHeaderLength(data, options?.dictionary)
    let state: InflateState = { mode: 2 }
    let payload = inflateRaw(data.subarray(header), state, options?.out, options?.dictionary)
    let trailer = header + byteCeil(state.bitPos || 0)
    if (options?.check !== false) {
        if (trailer + 4 > data.length) throw new UnexpectedEofError()
        if (readU32BE(data, trailer) !== adler32(payload)) throw new ChecksumMismatchError()
    }
    return payload
}

export class Compressor {
    #inner: RawCompressor
    #options: CompressOptions
    #sum = new Adler32()
    #header = false
    #done = false

    constructor(options: CompressOptions = {}) {
        this.#options = options
        this.#inner = new RawCompressor(options)
    }

    #wrap(raw: Uint8Array, final: boolean): Uint8Array {
        let header = 0
        if (!this.#header) {
            header = zlibHeaderSize(this.#options)
            this.#header = true
        }
        let footer = final ? 4 : 0
        if (!header && !footer) return raw
        let out = new Uint8Array(header + raw.length + footer)
        if (header) writeZlibHeader(out, this.#options)
        out.set(raw, header)
        if (footer) writeU32BE(out, header + raw.length, this.#sum.digest())
        return out
    }

    push(chunk: Uint8Array, final?: boolean): Uint8Array {
        if (this.#done) throw new StreamFinishedError()
        this.#sum.update(chunk)
        this.#done = !!final
        return this.#wrap(this.#inner.push(chunk, final), !!final)
    }

    flush(sync?: boolean): Uint8Array {
        if (this.#done) throw new StreamFinishedError()
        return this.#wrap(this.#inner.flush(sync), false)
    }
}

export class Decompressor {
    #pending = u8.empty
    #header = false
    #state: InflateState = { mode: 0 }
    #window = new Uint8Array(32768)
    #sum = new Adler32()
    #dictionary?: Uint8Array
    #check: boolean
    #done = false

    constructor(options?: DecompressOptions) {
        this.#dictionary = options?.dictionary
        this.#check = options?.check !== false
        if (options?.dictionary) {
            this.#window.set(options.dictionary.subarray(-32768), 32768 - Math.min(32768, options.dictionary.length))
        }
    }

    push(chunk: Uint8Array, final?: boolean): Uint8Array {
        if (this.#done) throw new StreamFinishedError()
        if (!this.#pending.length) this.#pending = chunk
        else if (chunk.length) {
            let next = new Uint8Array(this.#pending.length + chunk.length)
            next.set(this.#pending)
            next.set(chunk, this.#pending.length)
            this.#pending = next
        }

        if (!this.#header) {
            if (this.#pending.length < 2 && !final) return u8.empty
            let size = zlibHeaderLength(this.#pending, this.#dictionary)
            if (this.#dictionary) {
                this.#state.outputLength = Math.min(32768, this.#dictionary.length)
                this.#window = new Uint8Array(32768)
                this.#window.set(this.#dictionary.subarray(-32768))
            }
            this.#pending = this.#pending.subarray(size)
            this.#header = true
        }

        this.#state.mode = final ? 1 : 0
        let start = this.#state.outputLength || 0
        let out = inflateRaw(this.#pending, this.#state, this.#window, this.#header && !start ? this.#dictionary : undefined)
        let produced = new Uint8Array(out.subarray(start, Math.min(this.#state.outputLength || 0, out.length)))
        if (produced.length) this.#sum.update(produced)
        if (this.#state.final && !this.#state.lengthMap) {
            this.#pending = this.#pending.subarray(byteCeil(this.#state.bitPos || 0))
            this.#state.bitPos = 0
        } else {
            this.#pending = this.#pending.subarray(((this.#state.bitPos || 0) / 8) | 0)
            this.#state.bitPos = (this.#state.bitPos || 0) & 7
        }
        this.#window = new Uint8Array(out.subarray(Math.max(0, (this.#state.outputLength || 0) - 32768)))
        this.#state.outputLength = this.#window.length

        if (final) {
            this.#done = true
            if (this.#check && this.#state.final) {
                if (this.#pending.length < 4) throw new UnexpectedEofError()
                if (readU32BE(this.#pending, 0) !== this.#sum.digest()) throw new ChecksumMismatchError()
            }
        }
        return produced.length ? produced : u8.empty
    }
}
