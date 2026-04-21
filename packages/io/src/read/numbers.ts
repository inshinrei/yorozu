import { SyncReadable } from "../types"
import { PartialReadError } from "../errors"
import { getDv } from "../_utils"

export function uint8(readable: SyncReadable): number {
    return readable.readSync(1)[0]
}

function _maybeRead(readable: SyncReadable | Uint8Array, size: number): Uint8Array {
    if (ArrayBuffer.isView(readable)) {
        if (readable.byteLength < size) throw new PartialReadError(readable, size)
        return readable
    }
    let buf = readable.readSync(size)
    if (buf.length < size) throw new PartialReadError(buf, size)
    return buf
}

export function int8(readable: SyncReadable | Uint8Array): number {
    let value = _maybeRead(readable, 1)[0]
    return value & 0x80 ? value - 0x100 : value
}

export function uint16le(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 2)
    return b[0] | (b[1] << 8)
}

export function uint16be(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 2)
    return (b[0] << 8) | b[1]
}

export function uint24le(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 3)
    return b[0] | (b[1] << 8) | (b[2] << 16)
}

export function uint24be(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 3)
    return (b[0] << 16) | (b[1] << 8) | b[2]
}

export function uint32le(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 4)
    return b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)
}

export function uint32be(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 4)
    return (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]
}

export function uint64le(readable: SyncReadable | Uint8Array): bigint {
    let b = _maybeRead(readable, 8)
    let lo = BigInt(b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24))
    let hi = BigInt(b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24))
    return lo | (hi << 32n)
}

export function uint64be(readable: SyncReadable | Uint8Array): bigint {
    let b = _maybeRead(readable, 8)
    let hi = BigInt((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3])
    let lo = BigInt((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7])
    return (hi << 32n) | lo
}

export function int16le(readable: SyncReadable | Uint8Array): number {
    let value = uint16le(readable)
    return value & 0x8000 ? value | 0xffff0000 : value
}

export function int16be(readable: SyncReadable | Uint8Array): number {
    let value = uint16be(readable)
    return value & 0x8000 ? value | 0xffff0000 : value
}

export function int24le(readable: SyncReadable | Uint8Array): number {
    let value = uint24le(readable)
    return value & 0x800000 ? value | 0xff000000 : value
}

export function int24be(readable: SyncReadable | Uint8Array): number {
    let value = uint24be(readable)
    return value & 0x800000 ? value | 0xff000000 : value
}

export function int32le(readable: SyncReadable | Uint8Array): number {
    return uint32le(readable) | 0
}

export function int32be(readable: SyncReadable | Uint8Array): number {
    return uint32be(readable) | 0
}

export function int64le(readable: SyncReadable | Uint8Array): bigint {
    let value = uint64le(readable)
    let signBit = 1n << 63n
    return value & signBit ? value - (1n << 64n) : value
}

export function int64be(readable: SyncReadable | Uint8Array): bigint {
    let value = uint64be(readable)
    let signBit = 1n << 63n
    return value & signBit ? value - (1n << 64n) : value
}

export function uintle(readable: SyncReadable | Uint8Array, size: number): bigint {
    let b = _maybeRead(readable, size)
    let value = 0n
    for (let i = 0; i < size; i++) value |= BigInt(b[i]) << BigInt(i * 8)
    return value
}

export function uintbe(readable: SyncReadable | Uint8Array, size: number): bigint {
    let b = _maybeRead(readable, size)
    let value = 0n
    for (let i = 0; i < size; i++) value = (value << 8n) | BigInt(b[i])
    return value
}

export function intle(readable: SyncReadable | Uint8Array, size: number): bigint {
    let value = uintle(readable, size)
    let signBit = 1n << BigInt(8 * size - 1)
    if (value & signBit) value -= signBit * 2n
    return value
}

export function intbe(readable: SyncReadable | Uint8Array, size: number): bigint {
    let value = uintbe(readable, size)
    let signBit = 1n << BigInt(8 * size - 1)
    if (value & signBit) value -= signBit * 2n
    return value
}

export function float32le(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 4)
    return getDv(b).getFloat32(b.byteOffset, true)
}

export function float32be(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 4)
    return getDv(b).getFloat32(b.byteOffset, false)
}

export function float64le(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 8)
    return getDv(b).getFloat64(b.byteOffset, true)
}

export function float64be(readable: SyncReadable | Uint8Array): number {
    let b = _maybeRead(readable, 8)
    return getDv(b).getFloat64(b.byteOffset, false)
}
