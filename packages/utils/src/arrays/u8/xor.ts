import { allocate } from "./pool"

export function xor(data: Uint8Array, key: Uint8Array): Uint8Array {
    if (key.length < data.length)
        throw new RangeError(`Key must be at least as long as data (key=${key.length}, data=${data.length})`)

    let ret = allocate(data.length)
    for (let i = 0; i < data.length; i++) {
        ret[i] = data[i] ^ key[i]
    }

    return ret
}

export function xorInPlace(data: Uint8Array, key: Uint8Array): void {
    if (key.length < data.length)
        throw new RangeError(`Key must be at least as long as data (key=${key.length}, data=${data.length})`)

    for (let i = 0; i < data.length; i++) {
        data[i] ^= key[i]
    }
}
