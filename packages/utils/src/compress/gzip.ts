import { u8 } from "../arrays"
import { byteCeil } from "./bits"
import { Crc32, crc32 } from "./checksum"
import { Compressor as RawCompressor, deflateWithOptions } from "./deflate"
import { ChecksumMismatchError, InvalidHeaderError, StreamFinishedError, UnexpectedEofError } from "./errors"
import { inflateRaw, type InflateState } from "./inflate"
import type { DecompressOptions, GzipCompressOptions } from "./types"

function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
    buf[offset] = value
    buf[offset + 1] = value >>> 8
    buf[offset + 2] = value >>> 16
    buf[offset + 3] = value >>> 24
}

function readU32LE(buf: Uint8Array, offset: number): number {
    return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0
}

function gzipHeaderSize(options: GzipCompressOptions): number {
    return 10 + (options.filename ? options.filename.length + 1 : 0)
}

function writeGzipHeader(out: Uint8Array, options: GzipCompressOptions): void {
    out[0] = 31
    out[1] = 139
    out[2] = 8
    let level = options.level ?? 6
    out[8] = level < 2 ? 4 : level === 9 ? 2 : 0
    out[9] = 3
    if (options.mtime !== 0) {
        let time = Math.floor((options.mtime != null ? new Date(options.mtime).getTime() : Date.now()) / 1000)
        writeU32LE(out, 4, time >>> 0)
    }
    if (options.filename) {
        out[3] = 8
        for (let i = 0; i < options.filename.length; i++) out[10 + i] = options.filename.charCodeAt(i)
        out[10 + options.filename.length] = 0
    }
}

export function gzipHeaderLength(data: Uint8Array): number {
    if (data.length < 10) throw new UnexpectedEofError()
    if (data[0] !== 31 || data[1] !== 139 || data[2] !== 8) {
        throw new InvalidHeaderError("Invalid gzip header.")
    }
    let flags = data[3]
    let offset = 10
    if (flags & 4) {
        if (offset + 2 > data.length) throw new UnexpectedEofError()
        offset += (data[offset] | (data[offset + 1] << 8)) + 2
    }
    let strings = ((flags >> 3) & 1) + ((flags >> 4) & 1)
    while (strings) {
        if (offset >= data.length) throw new UnexpectedEofError()
        if (!data[offset++]) strings--
    }
    if (flags & 2) offset += 2
    if (offset > data.length) throw new UnexpectedEofError()
    return offset
}

function concatParts(parts: Uint8Array[]): Uint8Array {
    if (parts.length === 0) return u8.empty
    if (parts.length === 1) return parts[0]
    let out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let offset = 0
    for (let part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

function verifyFooter(footer: Uint8Array, data: Uint8Array, check: boolean): void {
    if (!check) return
    if (readU32LE(footer, 0) !== crc32(data) || readU32LE(footer, 4) !== data.length >>> 0) {
        throw new ChecksumMismatchError()
    }
}

export function compress(data: Uint8Array, options: GzipCompressOptions = {}): Uint8Array {
    let header = gzipHeaderSize(options)
    let out = deflateWithOptions(data, options, header, 8)
    writeGzipHeader(out, options)
    writeU32LE(out, out.length - 8, crc32(data))
    writeU32LE(out, out.length - 4, data.length >>> 0)
    return out
}

export function decompress(data: Uint8Array, options?: DecompressOptions): Uint8Array {
    let parts: Uint8Array[] = []
    let offset = 0
    while (offset < data.length) {
        let header = gzipHeaderLength(data.subarray(offset))
        offset += header
        let state: InflateState = { mode: 2 }
        let payload = inflateRaw(data.subarray(offset), state)
        parts.push(payload)
        offset += byteCeil(state.bitPos || 0)
        if (offset + 8 > data.length) throw new UnexpectedEofError()
        verifyFooter(data.subarray(offset, offset + 8), payload, options?.check !== false)
        offset += 8
    }
    return concatParts(parts)
}

export class Compressor {
    protected _inner: RawCompressor
    protected _options: GzipCompressOptions
    protected _crc: Crc32 = new Crc32()
    protected _length = 0
    protected _header = false
    protected _done = false

    constructor(options: GzipCompressOptions = {}) {
        this._options = options
        this._inner = new RawCompressor(options)
    }

    protected _wrap(raw: Uint8Array, final: boolean): Uint8Array {
        let header = 0
        if (!this._header) {
            header = gzipHeaderSize(this._options)
            this._header = true
        }
        let footer = final ? 8 : 0
        if (!header && !footer) return raw
        let out = new Uint8Array(header + raw.length + footer)
        if (header) writeGzipHeader(out, this._options)
        out.set(raw, header)
        if (footer) {
            writeU32LE(out, header + raw.length, this._crc.digest())
            writeU32LE(out, header + raw.length + 4, this._length >>> 0)
        }
        return out
    }

    push(chunk: Uint8Array, final?: boolean): Uint8Array {
        if (this._done) throw new StreamFinishedError()
        this._crc.update(chunk)
        this._length += chunk.length
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
    protected _needHeader = true
    protected _state: InflateState = { mode: 0 }
    protected _window: Uint8Array = new Uint8Array(32768)
    protected _crc: Crc32 = new Crc32()
    protected _length = 0
    protected _check: boolean
    protected _done = false

    constructor(options?: DecompressOptions) {
        this._check = options?.check !== false
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

        let parts: Uint8Array[] = []
        for (;;) {
            if (this._needHeader) {
                if (!this._pending.length) break
                if (this._pending.length < 10 && !final) break
                let header = gzipHeaderLength(this._pending)
                this._pending = this._pending.subarray(header)
                this._needHeader = false
                this._state = { mode: 0 }
                this._window = new Uint8Array(32768)
                this._crc = new Crc32()
                this._length = 0
            }

            this._state.mode = 0
            let start = this._state.outputLength || 0
            let out = inflateRaw(this._pending, this._state, this._window)
            let produced = out.subarray(start, Math.min(this._state.outputLength || 0, out.length))
            if (produced.length) {
                this._crc.update(produced)
                this._length += produced.length
                parts.push(new Uint8Array(produced))
            }
            if (this._state.final && !this._state.lengthMap) {
                this._pending = this._pending.subarray(byteCeil(this._state.bitPos || 0))
                this._state.bitPos = 0
            } else {
                this._pending = this._pending.subarray(((this._state.bitPos || 0) / 8) | 0)
                this._state.bitPos = (this._state.bitPos || 0) & 7
            }
            this._window = new Uint8Array(out.subarray(Math.max(0, (this._state.outputLength || 0) - 32768)))
            this._state.outputLength = this._window.length

            if (this._state.final && !this._state.lengthMap) {
                if (this._pending.length < 8) {
                    if (!final) break
                    throw new UnexpectedEofError()
                }
                if (this._check) {
                    if (readU32LE(this._pending, 0) !== this._crc.digest() || readU32LE(this._pending, 4) !== this._length >>> 0) {
                        throw new ChecksumMismatchError()
                    }
                }
                this._pending = this._pending.subarray(8)
                this._needHeader = true
                continue
            }
            break
        }

        if (final) this._done = true
        return concatParts(parts)
    }
}
