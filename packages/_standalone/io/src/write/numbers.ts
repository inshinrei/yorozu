import type { SyncWritable } from "../types.js"
import { getDv } from "../_utils.js"

function _maybeWrite(writable: SyncWritable | Uint8Array, size: number): Uint8Array {
    if (ArrayBuffer.isView(writable)) return writable.subarray(0, size)
    else return writable.writeSync(size)
}

function _checkInt(value: number | bigint, min: number | bigint, max: number | bigint): void {
    if (value < min || value > max) throw new RangeError(`Value out of bounds: ${value} (${min} ≤ value ≤ ${max}).`)
}

export function uint8(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, 0, 0xff)
    let buf = _maybeWrite(writable, 1)
    if (value < 0) value = 0x100 + value
    buf[0] = value & 0xff
}

export function int8(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, -0x80, 0x7f)
    let buf = _maybeWrite(writable, 1)
    if (value < 0) value = 0xff + value + 1
    buf[0] = value & 0xff
}

export function uint16le(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, 0, 0xffff)
    let buf = _maybeWrite(writable, 2)
    buf[0] = value & 0xff
    buf[1] = value >>> 8
}

export function uint16be(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, 0, 0xffff)
    let buf = _maybeWrite(writable, 2)
    buf[0] = value >>> 8
    buf[1] = value & 0xff
}

export function int16le(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    let buf = _maybeWrite(writable, 2)
    if (!noAssert) _checkInt(value, -0x8000, 0x7fff)
    buf[0] = value & 0xff
    buf[1] = value >>> 8
}

export function int16be(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    let buf = _maybeWrite(writable, 2)
    if (!noAssert) _checkInt(value, -0x8000, 0x7fff)
    buf[0] = value >>> 8
    buf[1] = value & 0xff
}

export function uint24le(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, 0, 0xffffff)
    let buf = _maybeWrite(writable, 3)
    buf[0] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[2] = value
}

export function uint24be(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, 0, 0xffffff)
    let buf = _maybeWrite(writable, 3)
    buf[2] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[0] = value
}

export function int24le(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, -0x800000, 0x7fffff)
    let buf = _maybeWrite(writable, 3)
    buf[0] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[2] = value
}

export function int24be(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    if (!noAssert) _checkInt(value, -0x800000, 0x7fffff)
    let buf = _maybeWrite(writable, 3)
    buf[2] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[0] = value
}

export function uint32le(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    let buf = _maybeWrite(writable, 4)
    if (!noAssert) _checkInt(value, 0, 0xffffffff)
    buf[0] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[2] = value
    value = value >>> 8
    buf[3] = value
}

export function uint32be(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    let buf = _maybeWrite(writable, 4)
    if (!noAssert) _checkInt(value, 0, 0xffffffff)
    buf[3] = value
    value = value >>> 8
    buf[2] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[0] = value
}

export function int32le(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    let buf = _maybeWrite(writable, 4)
    if (!noAssert) _checkInt(value, -0x80000000, 0x7fffffff)
    buf[0] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[2] = value
    value = value >>> 8
    buf[3] = value
}

export function int32be(writable: SyncWritable | Uint8Array, value: number, noAssert = false): void {
    let buf = _maybeWrite(writable, 4)
    if (!noAssert) _checkInt(value, -0x80000000, 0x7fffffff)
    buf[3] = value
    value = value >>> 8
    buf[2] = value
    value = value >>> 8
    buf[1] = value
    value = value >>> 8
    buf[0] = value
}

export function uint64le(writable: SyncWritable | Uint8Array, value: bigint, noAssert = false): void {
    let buf = _maybeWrite(writable, 8)
    if (!noAssert) _checkInt(value, 0n, 0xffffffffffffffffn)
    let lo = Number(value & 0xffffffffn)
    buf[0] = lo
    lo = lo >> 8
    buf[1] = lo
    lo = lo >> 8
    buf[2] = lo
    lo = lo >> 8
    buf[3] = lo
    let hi = Number((value >> 32n) & 0xffffffffn)
    buf[4] = hi
    hi = hi >> 8
    buf[5] = hi
    hi = hi >> 8
    buf[6] = hi
    hi = hi >> 8
    buf[7] = hi
}

export function uint64be(writable: SyncWritable | Uint8Array, value: bigint, noAssert = false): void {
    let buf = _maybeWrite(writable, 8)
    if (!noAssert) _checkInt(value, 0n, 0xffffffffffffffffn)
    let lo = Number(value & 0xffffffffn)
    buf[7] = lo
    lo = lo >> 8
    buf[6] = lo
    lo = lo >> 8
    buf[5] = lo
    lo = lo >> 8
    buf[4] = lo
    let hi = Number((value >> 32n) & 0xffffffffn)
    buf[3] = hi
    hi = hi >> 8
    buf[2] = hi
    hi = hi >> 8
    buf[1] = hi
    hi = hi >> 8
    buf[0] = hi
}

export function int64le(writable: SyncWritable | Uint8Array, value: bigint, noAssert = false): void {
    let buf = _maybeWrite(writable, 8)
    if (!noAssert) _checkInt(value, -0x8000000000000000n, 0x7fffffffffffffffn)
    let lo = Number(value & 0xffffffffn)
    buf[0] = lo
    lo = lo >> 8
    buf[1] = lo
    lo = lo >> 8
    buf[2] = lo
    lo = lo >> 8
    buf[3] = lo
    let hi = Number((value >> 32n) & 0xffffffffn)
    buf[4] = hi
    hi = hi >> 8
    buf[5] = hi
    hi = hi >> 8
    buf[6] = hi
    hi = hi >> 8
    buf[7] = hi
}

export function int64be(writable: SyncWritable | Uint8Array, value: bigint, noAssert = false): void {
    let buf = _maybeWrite(writable, 8)
    if (!noAssert) _checkInt(value, -0x8000000000000000n, 0x7fffffffffffffffn)
    let lo = Number(value & 0xffffffffn)
    buf[7] = lo
    lo = lo >> 8
    buf[6] = lo
    lo = lo >> 8
    buf[5] = lo
    lo = lo >> 8
    buf[4] = lo
    let hi = Number((value >> 32n) & 0xffffffffn)
    buf[3] = hi
    hi = hi >> 8
    buf[2] = hi
    hi = hi >> 8
    buf[1] = hi
    hi = hi >> 8
    buf[0] = hi
}

export function uintle(writable: SyncWritable | Uint8Array, size: number, value: bigint, noAssert = false): void {
    if (!noAssert) _checkInt(value, 0n, 2n ** BigInt(8 * size) - 1n)
    let buf = _maybeWrite(writable, size)
    let mul = 1n
    let i = 0
    buf[0] = Number(value & 0xffn)
    while (++i < size && (mul *= 0x100n)) buf[i] = Number((value / mul) & 0xffn)
}

export function uintbe(writable: SyncWritable | Uint8Array, size: number, value: bigint, noAssert = false): void {
    if (!noAssert) _checkInt(value, 0n, 2n ** BigInt(8 * size) - 1n)
    let buf = _maybeWrite(writable, size)
    let i = size - 1
    let mul = 1n
    buf[i] = Number(value & 0xffn)
    while (--i >= 0 && (mul *= 0x100n)) buf[i] = Number((value / mul) & 0xffn)
}

export function intle(writable: SyncWritable | Uint8Array, size: number, value: bigint, noAssert = false): void {
    if (!noAssert) {
        let limit = 2n ** BigInt(8 * size - 1)

        _checkInt(value, -limit, limit - 1n)
    }
    let buf = _maybeWrite(writable, size)
    let i = 0
    let mul = 1n
    let sub = 0n
    buf[0] = Number(value & 0xffn)
    while (++i < size && (mul *= 0x100n)) {
        if (value < 0 && sub === 0n && buf[i - 1] !== 0) sub = 1n
        buf[i] = Number((value / mul - sub) & 0xffn)
    }
}

export function intbe(writable: SyncWritable | Uint8Array, size: number, value: bigint, noAssert = false): void {
    if (!noAssert) {
        let limit = 2n ** BigInt(8 * size - 1)
        _checkInt(value, -limit, limit - 1n)
    }
    let buf = _maybeWrite(writable, size)
    let i = size - 1
    let mul = 1n
    let sub = 0n
    buf[i] = Number(value & 0xffn)
    while (--i >= 0 && (mul *= 0x100n)) {
        if (value < 0 && sub === 0n && buf[i + 1] !== 0) sub = 1n
        buf[i] = Number((value / mul - sub) & 0xffn)
    }
}

export function float32le(writable: SyncWritable | Uint8Array, value: number): void {
    let buf = _maybeWrite(writable, 4)
    getDv(buf).setFloat32(buf.byteOffset, value, true)
}

export function float32be(writable: SyncWritable | Uint8Array, value: number): void {
    let buf = _maybeWrite(writable, 4)
    getDv(buf).setFloat32(buf.byteOffset, value, false)
}

export function float64le(writable: SyncWritable | Uint8Array, value: number): void {
    let buf = _maybeWrite(writable, 8)
    getDv(buf).setFloat64(buf.byteOffset, value, true)
}

export function float64be(writable: SyncWritable | Uint8Array, value: number): void {
    let buf = _maybeWrite(writable, 8)
    getDv(buf).setFloat64(buf.byteOffset, value, false)
}
