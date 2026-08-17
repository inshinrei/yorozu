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
    protected _inner: RawCompressor
    protected _options: CompressOptions
    protected _sum: Adler32 = new Adler32()
    protected _header = false
    protected _done = false

    constructor(options: CompressOptions = {}) {
        this._options = options
        this._inner = new RawCompressor(options)
    }

    protected _wrap(raw: Uint8Array, final: boolean): Uint8Array {
        let header = 0
        if (!this._header) {
            header = zlibHeaderSize(this._options)
            this._header = true
        }
        let footer = final ? 4 : 0
        if (!header && !footer) return raw
        let out = new Uint8Array(header + raw.length + footer)
        if (header) writeZlibHeader(out, this._options)
        out.set(raw, header)
        if (footer) writeU32BE(out, header + raw.length, this._sum.digest())
        return out
    }

    push(chunk: Uint8Array, final?: boolean): Uint8Array {
        if (this._done) throw new StreamFinishedError()
        this._sum.update(chunk)
        this._done = !!final
        return this._wrap(this._inner.push(chunk, final), !!final)
    }

    flush(sync?: boolean): Uint8Array {
        if (this._done) throw new StreamFinishedError()
        return this._wrap(this._inner.flush(sync), false)
    }
}

export class Decompressor {
    protected _pending: Uint8Array = u8.empty
    protected _header = false
    protected _state: InflateState = { mode: 0 }
    protected _window: Uint8Array = new Uint8Array(32768)
    protected _sum: Adler32 = new Adler32()
    protected _dictionary?: Uint8Array
    protected _check: boolean
    protected _done = false

    constructor(options?: DecompressOptions) {
        this._dictionary = options?.dictionary
        this._check = options?.check !== false
        if (options?.dictionary) {
            this._window.set(options.dictionary.subarray(-32768), 32768 - Math.min(32768, options.dictionary.length))
        }
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

        if (!this._header) {
            if (this._pending.length < 2 && !final) return u8.empty
            let size = zlibHeaderLength(this._pending, this._dictionary)
            if (this._dictionary) {
                this._state.outputLength = Math.min(32768, this._dictionary.length)
                this._window = new Uint8Array(32768)
                this._window.set(this._dictionary.subarray(-32768))
            }
            this._pending = this._pending.subarray(size)
            this._header = true
        }

        this._state.mode = final ? 1 : 0
        let start = this._state.outputLength || 0
        let out = inflateRaw(this._pending, this._state, this._window, this._header && !start ? this._dictionary : undefined)
        let produced = new Uint8Array(out.subarray(start, Math.min(this._state.outputLength || 0, out.length)))
        if (produced.length) this._sum.update(produced)
        if (this._state.final && !this._state.lengthMap) {
            this._pending = this._pending.subarray(byteCeil(this._state.bitPos || 0))
            this._state.bitPos = 0
        } else {
            this._pending = this._pending.subarray(((this._state.bitPos || 0) / 8) | 0)
            this._state.bitPos = (this._state.bitPos || 0) & 7
        }
        this._window = new Uint8Array(out.subarray(Math.max(0, (this._state.outputLength || 0) - 32768)))
        this._state.outputLength = this._window.length

        if (final) {
            this._done = true
            if (this._check && this._state.final) {
                if (this._pending.length < 4) throw new UnexpectedEofError()
                if (readU32BE(this._pending, 0) !== this._sum.digest()) throw new ChecksumMismatchError()
            }
        }
        return produced.length ? produced : u8.empty
    }
}
