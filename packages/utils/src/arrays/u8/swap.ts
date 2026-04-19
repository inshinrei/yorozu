export function swap16(buf: Uint8Array): void {
    if (buf.length % 2 !== 0) throw new RangeError(`Buffer length must be a multiple of 2`)
    for (let i = 0; i < buf.length; i += 2) {
        let tmp = buf[i]
        buf[i] = buf[i + 1]
        buf[i + 1] = tmp
    }
}

export function swap32(buf: Uint8Array): void {
    if (buf.length % 4 !== 0) throw new RangeError(`Buffer length must be a multiple of 4`)
    for (let i = 0; i < buf.length; i += 4) {
        let tmp = buf[i]
        buf[i] = buf[i + 3]
        buf[i + 3] = tmp
        tmp = buf[i + 1]
        buf[i + 1] = buf[i + 2]
        buf[i + 2] = tmp
    }
}

export function swap64(buf: Uint8Array): void {
    if (buf.length % 8 !== 0) throw new RangeError(`Buffer length must be a multiple of 8`)
    for (let i = 0; i < buf.length; i += 8) {
        let tmp = buf[i]
        buf[i] = buf[i + 7]
        buf[i + 7] = tmp
        tmp = buf[i + 1]
        buf[i + 1] = buf[i + 6]
        buf[i + 6] = tmp
        tmp = buf[i + 2]
        buf[i + 2] = buf[i + 5]
        buf[i + 5] = tmp
        tmp = buf[i + 3]
        buf[i + 3] = buf[i + 4]
        buf[i + 4] = tmp
    }
}

export function swapNibbles(buf: Uint8Array): void {
    for (let i = 0; i < buf.length; i++) {
        buf[i] = ((buf[i] & 0xf0) >> 4) | ((buf[i] & 0x0f) << 4)
    }
}
