export function readBits(data: Uint8Array, bitPos: number, mask: number): number {
    let offset = (bitPos / 8) | 0
    return ((data[offset] | (data[offset + 1] << 8)) >> (bitPos & 7)) & mask
}

export function readBits16(data: Uint8Array, bitPos: number): number {
    let offset = (bitPos / 8) | 0
    return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16)) >> (bitPos & 7)
}

export function writeBits(data: Uint8Array, bitPos: number, value: number): void {
    value <<= bitPos & 7
    let offset = (bitPos / 8) | 0
    data[offset] |= value
    data[offset + 1] |= value >> 8
}

export function writeBits16(data: Uint8Array, bitPos: number, value: number): void {
    value <<= bitPos & 7
    let offset = (bitPos / 8) | 0
    data[offset] |= value
    data[offset + 1] |= value >> 8
    data[offset + 2] |= value >> 16
}

export function byteCeil(bitPos: number): number {
    return ((bitPos + 7) / 8) | 0
}
