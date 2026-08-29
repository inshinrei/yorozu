import type { Clock, OutboxEntry } from "./types"

export function newOutboxId(now: number): string {
    return now.toString(36) + "-" + Math.random().toString(36).slice(2, 10)
}

export function resolveClock(clock?: Clock): Clock {
    return clock ?? { now: () => Date.now() }
}

export function newOutboxEntry(
    now: number,
    params: {
        type: string
        payload: unknown
        rollbackType?: string
        rollbackPayload?: unknown
    },
): OutboxEntry {
    let entry: OutboxEntry = {
        id: newOutboxId(now),
        createdAt: now,
        reservedTo: 0,
        type: params.type,
        payload: params.payload,
        attempts: 0,
    }
    if (params.rollbackType !== undefined) entry.rollbackType = params.rollbackType
    if (params.rollbackPayload !== undefined) entry.rollbackPayload = params.rollbackPayload
    return entry
}
