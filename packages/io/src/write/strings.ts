import { utf8 } from "@yorozu/utils"
import { SyncWritable } from "../types"

export function bytes(writable: SyncWritable, bytes: Uint8Array): void {
    writable.writeSync(bytes.length).set(bytes)
    writable.disposeWriteSync()
}

export function bytesReversed(writable: SyncWritable, bytes: Uint8Array): void {
    const buf = writable.writeSync(bytes.length)
    buf.set(bytes)
    buf.reverse()
    writable.disposeWriteSync()
}

export function rawString(writable: SyncWritable, str: string): void {
    const buf = writable.writeSync(str.length)
    for (let i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i)
    }
    writable.disposeWriteSync()
}

export function utf8String(writable: SyncWritable, str: string): void {
    const len = utf8.encodedLength(str)
    const buf = writable.writeSync(len)
    utf8.encoder.encodeInto(str, buf)
    writable.disposeWriteSync()
}

export function utf16beString(writable: SyncWritable, str: string): void {
    const buf = writable.writeSync(str.length * 2)
    for (let i = 0, j = 0; i < str.length; i++, j += 2) {
        const char = str.charCodeAt(i)
        buf[j + 1] = char & 0xff
        buf[j] = (char >> 8) & 0xff
    }
    writable.disposeWriteSync()
}

export function utf16leString(writable: SyncWritable, str: string): void {
    const buf = writable.writeSync(str.length * 2)
    for (let i = 0, j = 0; i < str.length; i++, j += 2) {
        const char = str.charCodeAt(i)
        buf[j] = char & 0xff
        buf[j + 1] = (char >> 8) & 0xff
    }
    writable.disposeWriteSync()
}

export function cUtf8String(writable: SyncWritable, str: string): void {
    const len = utf8.encodedLength(str)
    const buf = writable.writeSync(len + 1)
    utf8.encoder.encodeInto(str, buf)
    buf[len] = 0
    writable.disposeWriteSync()
}
