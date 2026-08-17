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
    #inner: RawCompressor
    #options: GzipCompressOptions
    #crc = new Crc32()
    #length = 0
    #header = false
    #done = false

    constructor(options: GzipCompressOptions = {}) {
        this.#options = options
        this.#inner = new RawCompressor(options)
    }

    #wrap(raw: Uint8Array, final: boolean): Uint8Array {
        let header = 0
        if (!this.#header) {
            header = gzipHeaderSize(this.#options)
            this.#header = true
        }
        let footer = final ? 8 : 0
        if (!header && !footer) return raw
        let out = new Uint8Array(header + raw.length + footer)
        if (header) writeGzipHeader(out, this.#options)
        out.set(raw, header)
        if (footer) {
            writeU32LE(out, header + raw.length, this.#crc.digest())
            writeU32LE(out, header + raw.length + 4, this.#length >>> 0)
        }
        return out
    }

    push(chunk: Uint8Array, final?: boolean): Uint8Array {
        if (this.#done) throw new StreamFinishedError()
        this.#crc.update(chunk)
        this.#length += chunk.length
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
    #needHeader = true
    #state: InflateState = { mode: 0 }
    #window = new Uint8Array(32768)
    #crc = new Crc32()
    #length = 0
    #check: boolean
    #done = false

    constructor(options?: DecompressOptions) {
        this.#check = options?.check !== false
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

        let parts: Uint8Array[] = []
        for (;;) {
            if (this.#needHeader) {
                if (!this.#pending.length) break
                if (this.#pending.length < 10 && !final) break
                let header = gzipHeaderLength(this.#pending)
                this.#pending = this.#pending.subarray(header)
                this.#needHeader = false
                this.#state = { mode: 0 }
                this.#window = new Uint8Array(32768)
                this.#crc = new Crc32()
                this.#length = 0
            }

            this.#state.mode = 0
            let start = this.#state.outputLength || 0
            let out = inflateRaw(this.#pending, this.#state, this.#window)
            let produced = out.subarray(start, Math.min(this.#state.outputLength || 0, out.length))
            if (produced.length) {
                this.#crc.update(produced)
                this.#length += produced.length
                parts.push(new Uint8Array(produced))
            }
            if (this.#state.final && !this.#state.lengthMap) {
                this.#pending = this.#pending.subarray(byteCeil(this.#state.bitPos || 0))
                this.#state.bitPos = 0
            } else {
                this.#pending = this.#pending.subarray(((this.#state.bitPos || 0) / 8) | 0)
                this.#state.bitPos = (this.#state.bitPos || 0) & 7
            }
            this.#window = new Uint8Array(out.subarray(Math.max(0, (this.#state.outputLength || 0) - 32768)))
            this.#state.outputLength = this.#window.length

            if (this.#state.final && !this.#state.lengthMap) {
                if (this.#pending.length < 8) {
                    if (!final) break
                    throw new UnexpectedEofError()
                }
                if (this.#check) {
                    if (readU32LE(this.#pending, 0) !== this.#crc.digest() || readU32LE(this.#pending, 4) !== this.#length >>> 0) {
                        throw new ChecksumMismatchError()
                    }
                }
                this.#pending = this.#pending.subarray(8)
                this.#needHeader = true
                continue
            }
            break
        }

        if (final) this.#done = true
        return concatParts(parts)
    }
}
