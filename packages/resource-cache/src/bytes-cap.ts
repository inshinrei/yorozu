export type BytesCapItem = {
    key: string
    storedAt: number
    bytes: number
}

export function pickOldestOverBytesCapOrdered(
    oldestFirst: readonly BytesCapItem[],
    totalBytes: number,
    capBytes: number,
): string[] {
    if (capBytes > 0 && totalBytes <= capBytes) return []
    let remaining = totalBytes
    let limit = capBytes > 0 ? capBytes : 0
    let drop: string[] = []
    for (let it of oldestFirst) {
        if (it.bytes <= 0) continue
        if (remaining <= limit) break
        drop.push(it.key)
        remaining -= it.bytes
    }
    return drop
}

export function pickOldestOverBytesCap(items: readonly BytesCapItem[], capBytes: number): string[] {
    let withBytes = items.filter((it) => it.bytes > 0)
    if (!withBytes.length) return []
    let total = 0
    for (let it of withBytes) total += it.bytes
    let ordered = [...withBytes].sort((a, b) => a.storedAt - b.storedAt || a.key.localeCompare(b.key))
    return pickOldestOverBytesCapOrdered(ordered, total, capBytes)
}
