import type { Collection, Db } from "@yorozu/db"
import { makeLog, makeSilentLog, type Logger } from "@yorozu/log"
import { newOutboxEntry, resolveClock } from "./ids"
import { createListenerSet } from "./notify"
import type { Clock, OutboxEntry, OutboxStore } from "./types"

const ISSUE_KEY: string = "yorozu-outbox"
const BY_CLAIM: string = "by-claim"
const BY_FAILED: string = "by-failed"

type OutboxRow = OutboxEntry & Record<string, unknown>

function asRow(entry: OutboxEntry): OutboxRow {
    return entry as OutboxRow
}

function fromRow(row: OutboxRow): OutboxEntry {
    let entry: OutboxEntry = {
        id: row.id,
        createdAt: row.createdAt,
        reservedTo: row.reservedTo,
        type: row.type,
        payload: row.payload,
        attempts: row.attempts,
    }
    if (row.rollbackType !== undefined) entry.rollbackType = row.rollbackType
    if (row.rollbackPayload !== undefined) entry.rollbackPayload = row.rollbackPayload
    if (row.lastError !== undefined) entry.lastError = row.lastError
    if (row.failedAt !== undefined) entry.failedAt = row.failedAt
    return entry
}

class CollectionOutboxStore implements OutboxStore {
    protected _col: Collection<OutboxRow>
    protected _db: Db
    protected _clock: Clock
    protected _log: Logger
    protected _listeners = createListenerSet()

    constructor(opts: { collection: Collection<OutboxRow>; db: Db; clock?: Clock; log?: Logger }) {
        this._col = opts.collection
        this._db = opts.db
        this._clock = resolveClock(opts.clock)
        this._log = makeLog(opts.log ?? makeSilentLog(), ISSUE_KEY)
    }

    protected _transact<R>(fn: (col: Collection<OutboxRow>) => Promise<R>): Promise<R> {
        return this._db.transact([this._col.name], "rw", (db) => fn(db.collection<OutboxRow>(this._col.name)))
    }

    async enqueue(params: {
        type: string
        payload: unknown
        rollbackType?: string
        rollbackPayload?: unknown
    }): Promise<string> {
        let id = await this._transact(async (col) => {
            let entry = newOutboxEntry(this._clock.now(), params)
            await col.put(asRow(entry))
            return entry.id
        })
        this._listeners.notify()
        return id
    }

    async get(id: string): Promise<OutboxEntry | null> {
        let row = await this._col.get(id)
        return row ? fromRow(row) : null
    }

    async claim(leaseDurationMs: number): Promise<OutboxEntry | null> {
        return this._transact(async (col) => {
            let now = this._clock.now()
            let hits = await col.scan(BY_CLAIM, { lte: [now, Number.MAX_SAFE_INTEGER] })
            let best: OutboxEntry | null = null
            for (let hit of hits) {
                let row = hit.value ?? (await col.get(String(hit.primaryKey)))
                if (!row) {
                    this._log.warn("never-happen", { reason: "claim-missing-row", primaryKey: hit.primaryKey })
                    continue
                }
                let entry = fromRow(row)
                if (entry.failedAt != null) continue
                if (entry.reservedTo > now) continue
                if (!best || entry.createdAt < best.createdAt) best = entry
            }
            if (!best) return null
            let updated: OutboxEntry = {
                ...best,
                reservedTo: now + leaseDurationMs,
                attempts: best.attempts + 1,
            }
            await col.put(asRow(updated))
            return fromRow(asRow(updated))
        })
    }

    async delete(id: string): Promise<void> {
        await this._transact(async (col) => {
            await col.delete([id])
        })
    }

    async release(id: string): Promise<void> {
        await this._transact(async (col) => {
            let row = await col.get(id)
            if (!row) return
            await col.put(asRow({ ...fromRow(row), reservedTo: 0 }))
        })
        this._listeners.notify()
    }

    async updateAfterFailure(id: string, error: string, nextReservedTo?: number): Promise<void> {
        await this._transact(async (col) => {
            let row = await col.get(id)
            if (!row) return
            let entry = fromRow(row)
            await col.put(
                asRow({
                    ...entry,
                    lastError: error,
                    reservedTo: nextReservedTo ?? entry.reservedTo,
                }),
            )
        })
        this._listeners.notify()
    }

    async markFailed(id: string, error?: string): Promise<void> {
        await this._transact(async (col) => {
            let row = await col.get(id)
            if (!row) return
            let entry = fromRow(row)
            await col.put(
                asRow({
                    ...entry,
                    failedAt: this._clock.now(),
                    lastError: error ?? entry.lastError,
                    reservedTo: Number.MAX_SAFE_INTEGER,
                }),
            )
        })
    }

    async listFailed(): Promise<OutboxEntry[]> {
        let hits = await this._col.scan(BY_FAILED)
        let out: OutboxEntry[] = []
        for (let hit of hits) {
            let row = hit.value ?? (await this._col.get(String(hit.primaryKey)))
            if (!row) {
                this._log.warn("never-happen", { reason: "list-failed-missing-row", primaryKey: hit.primaryKey })
                continue
            }
            let entry = fromRow(row)
            if (entry.failedAt != null) out.push(entry)
        }
        return out
    }

    async retry(id: string): Promise<void> {
        await this._transact(async (col) => {
            let row = await col.get(id)
            if (!row) return
            let { failedAt: _failedAt, lastError: _lastError, ...rest } = fromRow(row)
            await col.put(asRow({ ...rest, attempts: 0, reservedTo: 0 }))
        })
        this._listeners.notify()
    }

    async releaseUncounted(id: string, error?: string, nextReservedTo?: number): Promise<void> {
        await this._transact(async (col) => {
            let row = await col.get(id)
            if (!row) return
            let entry = fromRow(row)
            await col.put(
                asRow({
                    ...entry,
                    attempts: Math.max(0, entry.attempts - 1),
                    lastError: error ?? entry.lastError,
                    reservedTo: nextReservedTo ?? 0,
                }),
            )
        })
        this._listeners.notify()
    }

    async deleteAll(): Promise<void> {
        await this._transact(async (col) => {
            await col.clear()
        })
    }

    async count(): Promise<number> {
        return this._col.count()
    }

    subscribe(listener: () => void): () => void {
        return this._listeners.subscribe(listener)
    }

    async nextDueAt(): Promise<number | null> {
        let hits = await this._col.scan(BY_CLAIM)
        for (let hit of hits) {
            let row = hit.value ?? (await this._col.get(String(hit.primaryKey)))
            if (!row) {
                this._log.warn("never-happen", { reason: "next-due-missing-row", primaryKey: hit.primaryKey })
                continue
            }
            let entry = fromRow(row)
            if (entry.failedAt != null) continue
            return entry.reservedTo
        }
        return null
    }
}

export function createOutboxStore(opts: {
    collection: Collection<OutboxEntry & Record<string, unknown>>
    db: Db
    clock?: Clock
    log?: Logger
}): OutboxStore {
    return new CollectionOutboxStore(opts)
}
