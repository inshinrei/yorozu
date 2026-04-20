import { bitLength } from "./math"
import { u8 } from "../arrays"

export function toBytes(value: bigint, length = 0, le = false): Uint8Array {
    let bits = bitLength(value)
    let bytes = Math.ceil(bits / 8)
    if (length !== 0 && bytes > length)
        throw new RangeError(`Value out of bounds: ${bytes.toString()}, ${length.toString()}.`)
    if (length === 0) length = bytes
    let buf = new ArrayBuffer(length)
    let u8 = new Uint8Array(buf)
    let unaligned = length % 8
    let dv = new DataView(buf, 0, length - unaligned)
    for (let i = 0; i < dv.byteLength; i += 8) {
        dv.setBigUint64(i, value & 0xffffffffffffffffn, true)
        value >>= 64n
    }

    if (unaligned > 0) {
        for (let i = length - unaligned; i < length; i++) {
            u8[i] = Number(value & 0xffn)
            value >>= 8n
        }
    }

    if (!le) u8.reverse()
    return u8
}

export function fromBytes(buffer: Uint8Array, le = false): bigint {
    if (le) buffer = u8.toReversed(buffer)
    let unaligned = buffer.length % 8
    let dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength - unaligned)
    let res = 0n
    for (let i = 0; i < dv.byteLength; i += 8) res = (res << 64n) | BigInt(dv.getBigUint64(i, false))
    if (unaligned > 0) {
        for (let i = buffer.length - unaligned; i < buffer.length; i++) res = (res << 8n) | BigInt(buffer[i])
    }

    return res
}
