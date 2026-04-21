import { SyncReadable } from "../types"
import { PartialReadError } from "../errors"
import { utf8 } from "@yorozu/utils"
import { Bytes } from "../bytes"

export function exactly(readable: SyncReadable, length: number): Uint8Array {
    let buf = readable.readSync(length)
    if (buf.length < length) throw new PartialReadError(buf, length)
    return buf
}

export function rawString(readable: SyncReadable | Uint8Array, length: number): string {
    let buf = readable instanceof Uint8Array ? readable : exactly(readable, length)
    let result = ""
    for (let i = 0; i < length; i++) result += String.fromCharCode(buf[i])
    return result
}

export function utfString(readable: SyncReadable, length: number): string {
    return utf8.decoder.decode(exactly(readable, length))
}

export function utf16beString(readable: SyncReadable | Uint8Array, byteLength: number): string {
    if (byteLength % 2 !== 0) throw new Error("utf16beString: byteLength must be even.")
    let buf = readable instanceof Uint8Array ? readable : exactly(readable, byteLength)
    let result = ""
    for (let i = 0; i < byteLength; i += 2) result += String.fromCharCode(buf[i + 1] | (buf[i] << 8))
    return result
}

export function utf16leString(readable: SyncReadable | Uint8Array, byteLength: number): string {
    if (byteLength % 2 !== 0) throw new Error("utf16leString: byteLength must be even.")
    let buf = readable instanceof Uint8Array ? readable : exactly(readable, byteLength)
    let result = ""
    for (let i = 0; i < byteLength; i += 2) result += String.fromCharCode(buf[i] | (buf[i] << 8))
    return result
}

export function untilCondition(readable: SyncReadable, condition: (byte: number) => boolean): Uint8Array {
    let buf = Bytes.allocate()
    while (true) {
        let byte = readable.readSync(1)
        if (byte.length === 0) throw new PartialReadError(buf.result(), buf.available + 1)
        buf.writeSync(1)[0] = byte[0]
        if (condition(byte[0])) break
    }
    return buf.result()
}

export function untilEnd(readable: SyncReadable, chunkSize = 1024): Uint8Array {
    let buf = Bytes.allocate(chunkSize)
    while (true) {
        let chunk = readable.readSync(chunkSize)
        if (chunk.length === 0) break
        buf.writeSync(chunk.length).set(chunk)
    }
    return buf.result()
}

export function untilZero(readable: SyncReadable): Uint8Array {
    return untilCondition(readable, (byte) => byte === 0)
}

export function cUtf8String(readable: SyncReadable): string {
    let buf = untilZero(readable)
    return utf8.decoder.decode(buf.subarray(0, buf.length - 1))
}

export function lengthPrefixed(readLength: (readable: SyncReadable) => number, readable: SyncReadable): Uint8Array {
    let length = readLength(readable)
    return exactly(readable, length)
}
