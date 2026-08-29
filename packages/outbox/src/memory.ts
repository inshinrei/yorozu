import { newOutboxEntry, resolveClock } from "./ids"
import { createListenerSet } from "./notify"
import type { Clock, OutboxEntry, OutboxStore } from "./types"

function pickClaimable(items: OutboxEntry[], now: number): OutboxEntry | null {
    let best: OutboxEntry | null = null
    for (let entry of items) {
        if (entry.failedAt != null) continue
        if (entry.reservedTo > now) continue
        if (!best || entry.createdAt < best.createdAt) best = entry
    }
    return best
}

class MemoryOutboxStore implements OutboxStore {
    protected _items: OutboxEntry[] = []
    protected _clock: Clock
    protected _listeners = createListenerSet()

    constructor(clock: Clock) {
        this._clock = clock
    }

    async enqueue(params: {
        type: string
        payload: unknown
        rollbackType?: string
        rollbackPayload?: unknown
    }): Promise<string> {
        let entry = newOutboxEntry(this._clock.now(), params)
        this._items.push(entry)
        this._listeners.notify()
        return entry.id
    }

    async get(id: string): Promise<OutboxEntry | null> {
        let found = this._items.find((e) => e.id === id)
        return found ? { ...found } : null
    }

    async claim(leaseDurationMs: number): Promise<OutboxEntry | null> {
        let now = this._clock.now()
        let chosen = pickClaimable(this._items, now)
        if (!chosen) return null
        let idx = this._items.indexOf(chosen)
        if (idx === -1) return null
        let updated: OutboxEntry = {
            ...chosen,
            reservedTo: now + leaseDurationMs,
            attempts: chosen.attempts + 1,
        }
        this._items[idx] = updated
        return { ...updated }
    }

    async delete(id: string): Promise<void> {
        this._items = this._items.filter((e) => e.id !== id)
    }

    async release(id: string): Promise<void> {
        let idx = this._items.findIndex((e) => e.id === id)
        if (idx === -1) return
        this._items[idx] = { ...this._items[idx]!, reservedTo: 0 }
        this._listeners.notify()
    }

    async updateAfterFailure(id: string, error: string, nextReservedTo?: number): Promise<void> {
        let idx = this._items.findIndex((e) => e.id === id)
        if (idx === -1) return
        let entry = this._items[idx]!
        this._items[idx] = {
            ...entry,
            lastError: error,
            reservedTo: nextReservedTo ?? entry.reservedTo,
        }
        this._listeners.notify()
    }

    async markFailed(id: string, error?: string): Promise<void> {
        let idx = this._items.findIndex((e) => e.id === id)
        if (idx === -1) return
        let entry = this._items[idx]!
        this._items[idx] = {
            ...entry,
            failedAt: this._clock.now(),
            lastError: error ?? entry.lastError,
            reservedTo: Number.MAX_SAFE_INTEGER,
        }
    }

    async listFailed(): Promise<OutboxEntry[]> {
        let out: OutboxEntry[] = []
        for (let entry of this._items) {
            if (entry.failedAt != null) out.push({ ...entry })
        }
        return out
    }

    async retry(id: string): Promise<void> {
        let idx = this._items.findIndex((e) => e.id === id)
        if (idx === -1) return
        let { failedAt: _failedAt, lastError: _lastError, ...rest } = this._items[idx]!
        this._items[idx] = { ...rest, attempts: 0, reservedTo: 0 }
        this._listeners.notify()
    }

    async releaseUncounted(id: string, error?: string, nextReservedTo?: number): Promise<void> {
        let idx = this._items.findIndex((e) => e.id === id)
        if (idx === -1) return
        let entry = this._items[idx]!
        this._items[idx] = {
            ...entry,
            attempts: Math.max(0, entry.attempts - 1),
            lastError: error ?? entry.lastError,
            reservedTo: nextReservedTo ?? 0,
        }
        this._listeners.notify()
    }

    async deleteAll(): Promise<void> {
        this._items = []
    }

    async count(): Promise<number> {
        return this._items.length
    }

    subscribe(listener: () => void): () => void {
        return this._listeners.subscribe(listener)
    }

    async nextDueAt(): Promise<number | null> {
        let best: number | null = null
        for (let entry of this._items) {
            if (entry.failedAt != null) continue
            if (best == null || entry.reservedTo < best) best = entry.reservedTo
        }
        return best
    }
}

export function openMemoryOutbox(opts?: { clock?: Clock }): OutboxStore {
    return new MemoryOutboxStore(resolveClock(opts?.clock))
}
