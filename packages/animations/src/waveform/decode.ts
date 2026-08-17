export function decodeWaveform(encoded5bit: Uint8Array): number[] {
    let bitsCount = encoded5bit.length * 8
    let valuesCount = Math.floor(bitsCount / 5)
    if (!valuesCount) return []

    let result: number[] = []
    for (let i = 0; i < valuesCount; i++) {
        let byteIndex = Math.floor((i * 5) / 8)
        let bitShift = (i * 5) % 8
        let lo = encoded5bit[byteIndex] ?? 0
        let hi = encoded5bit[byteIndex + 1] ?? 0
        result.push(((lo + (hi << 8)) >> bitShift) & 0x1f)
    }
    return result
}

export function fitWaveform(data: readonly number[], fitCount: number): number[] {
    let count = Math.max(0, Math.floor(fitCount))
    if (count === 0) return []
    if (data.length === 0) return Array.from({ length: count }, () => 0)

    let out: number[] = []
    let spring = data.length / count
    for (let i = 0; i < count; i++) {
        let idx = Math.min(data.length - 1, Math.floor(i * spring))
        out.push(data[idx] ?? 0)
    }
    return out
}
