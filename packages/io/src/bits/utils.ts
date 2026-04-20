const Rev8BitLookup: Array<number> = [0x0, 0x8, 0x4, 0xc, 0x2, 0xa, 0x6, 0xe, 0x1, 0x9, 0x5, 0xd, 0x3, 0xb, 0x7, 0xf]

export function reverse8Bits(byte: number): number {
    return (Rev8BitLookup[byte & 0b1111] << 4) | Rev8BitLookup[byte >> 4]
}

export function reverseBits(value: number, size: number): number {
    let result = 0
    for (let i = 0; i < size; i++) result |= ((value >> i) & 1) << (size - i - 1)
    return result
}

export function reverseBitsBig(value: bigint, size: number | bigint): bigint {
    if (typeof size === "number") size = BigInt(size)
    let result = 0n
    for (let i = 0n; i < size; i++) result |= ((value >> i) & 1n) << (size - i - 1n)
    return result
}

export function reverseBitsAll(buf: Uint8Array): void {
    for (let i = 0; i < buf.length; i++) {
        buf[i] = reverse8Bits(buf[i])
    }
}
