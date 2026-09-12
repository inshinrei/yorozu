import type { ResourceClass } from "./row"

export type BytesCapItem = {
    key: string
    storedAt: number
    bytes: number
    class?: ResourceClass
}

export function pickOldestOverBytesCapOrdered(
    oldestFirst: readonly BytesCapItem[],
    totalBytes: number,
    capBytes: number,
    opts?: { preferDrop?: ResourceClass[] },
): string[] {
    if (capBytes > 0 && totalBytes <= capBytes) return []
    let remaining = totalBytes
    let limit = capBytes > 0 ? capBytes : 0
    let drop: string[] = []
    let preferDrop = opts?.preferDrop
    if (!preferDrop?.length) {
        for (let it of oldestFirst) {
            if (it.bytes <= 0) continue
            if (remaining <= limit) break
            drop.push(it.key)
            remaining -= it.bytes
        }
        return drop
    }
    let dropped = new Set<string>()
    for (let cls of preferDrop) {
        for (let it of oldestFirst) {
            if (it.bytes <= 0) continue
            if (dropped.has(it.key)) continue
            if (it.class !== cls) continue
            if (remaining <= limit) break
            drop.push(it.key)
            dropped.add(it.key)
            remaining -= it.bytes
        }
        if (remaining <= limit) break
    }
    if (remaining > limit) {
        for (let it of oldestFirst) {
            if (it.bytes <= 0) continue
            if (dropped.has(it.key)) continue
            if (remaining <= limit) break
            drop.push(it.key)
            dropped.add(it.key)
            remaining -= it.bytes
        }
    }
    return drop
}

export function pickOldestOverBytesCap(
    items: readonly BytesCapItem[],
    capBytes: number,
    opts?: { preferDrop?: ResourceClass[] },
): string[] {
    let withBytes = items.filter((it) => it.bytes > 0)
    if (!withBytes.length) return []
    let total = 0
    for (let it of withBytes) total += it.bytes
    let ordered = [...withBytes].sort((a, b) => a.storedAt - b.storedAt || a.key.localeCompare(b.key))
    return pickOldestOverBytesCapOrdered(ordered, total, capBytes, opts)
}
