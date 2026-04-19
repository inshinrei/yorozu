import { allocate } from "./pool"

declare const Buffer: typeof import("node:buffer").Buffer

export function concat(bufs: Array<Uint8Array>): Uint8Array {
    if (bufs.length === 0) {
        return allocate(0)
    }

    if (bufs.length === 1) {
        return bufs[0]
    }

    if (typeof Buffer !== "undefined") {
        let buf = Buffer.concat(bufs)
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }

    let length = 0
    for (let i = 0; i < bufs.length; i++) {
        length += bufs[i].length
    }

    let ret = allocate(length)
    let offset = 0
    for (let i = 0; i < bufs.length; i++) {
        ret.set(bufs[i], offset)
        offset += bufs[i].length
    }

    return ret
}

export function concat2(a: ArrayLike<number>, b: ArrayLike<number>): Uint8Array {
    let ret = allocate(a.length + b.length)
    ret.set(a)
    ret.set(b, a.length)
    return ret
}

export function concat3(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>): Uint8Array {
    let ret = allocate(a.length + b.length + c.length)
    ret.set(a)
    ret.set(b, a.length)
    ret.set(c, a.length + b.length)
    return ret
}
