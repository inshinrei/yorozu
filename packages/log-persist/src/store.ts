import type { Collection, Db, ScanBound } from "@yorozu/db"
import type { LogHandler, LogLevel, LogRecord } from "@yorozu/log"
import { LOG_COLLECTION } from "./schema"
import { serializeArgs } from "./serialize"

const BY_TIME: string = "by-time"
const BY_SUBSYSTEM: string = "by-subsystem"
const BY_SUBSYSTEM_CATEGORY: string = "by-subsystem-category"

const DEFAULT_MAX_COUNT: number = 10_000
const DEFAULT_MAX_AGE_MS: number = 7 * 24 * 60 * 60 * 1000
const DEFAULT_ROTATE_EVERY: number = 32

let seq = 0

export type LogRow = {
    id: string
    timestamp: number
    subsystem: string
    category: string
    level: string
    msg: string
    arguments: Record<string, unknown>
}

type StoredLogRow = LogRow & Record<string, unknown>

export type LogStoreOpts = {
    maxCount?: number
    maxAgeMs?: number
    rotateEvery?: number
    clock?: { now: () => number }
}

export type LogQuery = {
    subsystem?: string
    category?: string
    level?: LogLevel | readonly LogLevel[]
    since?: number
    until?: number
    limit?: number
    direction?: "fwd" | "rev"
}

export type LogStore = {
    readonly handler: LogHandler
    query: (filter?: LogQuery) => Promise<LogRecord[]>
    rotate: () => Promise<void>
    clear: () => Promise<void>
    flush: () => Promise<void>
}

function nextId(timestamp: number): string {
    seq += 1
    return `${timestamp}-${seq}`
}

function toRecord(row: LogRow): LogRecord {
    return {
        subsystem: row.subsystem,
        category: row.category,
        level: row.level as LogLevel,
        msg: row.msg,
        arguments: row.arguments,
        timestamp: row.timestamp,
    }
}

function queryBound(filter: LogQuery | undefined): { index: string; bound: ScanBound } {
    let bound: ScanBound = {}
    if (filter?.direction != null) bound.direction = filter.direction
    let since = filter?.since
    let until = filter?.until
    let subsystem = filter?.subsystem
    let category = filter?.category
    if (subsystem != null && category != null) {
        bound.gte = since != null ? [subsystem, category, since] : [subsystem, category]
        if (until != null) bound.lt = [subsystem, category, until]
        else bound.lte = [subsystem, category, Number.MAX_SAFE_INTEGER]
        return { index: BY_SUBSYSTEM_CATEGORY, bound }
    }
    if (subsystem != null) {
        bound.gte = since != null ? [subsystem, since] : [subsystem]
        if (until != null) bound.lt = [subsystem, until]
        else bound.lte = [subsystem, Number.MAX_SAFE_INTEGER]
        return { index: BY_SUBSYSTEM, bound }
    }
    if (since != null) bound.gte = since
    if (until != null) bound.lt = until
    return { index: BY_TIME, bound }
}

function matchesLevel(row: LogRow, filter: LogQuery | undefined): boolean {
    if (filter?.level == null) return true
    if (typeof filter.level === "string") return row.level === filter.level
    return filter.level.includes(row.level as LogLevel)
}

export function openLogStore(db: Db, opts?: LogStoreOpts): LogStore {
    let col: Collection<StoredLogRow> = db.collection<StoredLogRow>(LOG_COLLECTION)
    let maxCount = opts?.maxCount ?? DEFAULT_MAX_COUNT
    let maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS
    let rotateEvery = opts?.rotateEvery ?? DEFAULT_ROTATE_EVERY
    let successful = 0
    let chain: Promise<void> = Promise.resolve()

    const now = (): number => opts?.clock?.now() ?? Date.now()

    const doRotate = async (): Promise<void> => {
        let cutoff = now() - maxAgeMs
        let aged = await col.scan(BY_TIME, { lt: cutoff, keysOnly: true })
        if (aged.length > 0) {
            await col.delete(aged.map((hit) => String(hit.primaryKey)))
        }
        let n = await col.count()
        if (n <= maxCount) return
        let excess = n - maxCount
        let oldest = await col.scan(BY_TIME, { keysOnly: true, direction: "fwd", limit: excess })
        if (oldest.length > 0) {
            await col.delete(oldest.map((hit) => String(hit.primaryKey)))
        }
    }

    const putRow = async (row: StoredLogRow): Promise<void> => {
        try {
            await col.put(row)
            successful += 1
            if (rotateEvery <= 0 || successful % rotateEvery === 0) {
                await doRotate()
            }
        } catch {
            // logging must not break the app
        }
    }

    const enqueue = (work: () => Promise<void>): void => {
        chain = chain.then(work, work)
    }

    const handler: LogHandler = (record) => {
        try {
            let row: StoredLogRow = {
                id: nextId(record.timestamp),
                timestamp: record.timestamp,
                subsystem: record.subsystem,
                category: record.category,
                level: record.level,
                msg: record.msg,
                arguments: serializeArgs(record.arguments),
            }
            enqueue(() => putRow(row))
        } catch {
            // logging must not break the app
        }
    }

    const query = async (filter?: LogQuery): Promise<LogRecord[]> => {
        let { index, bound } = queryBound(filter)
        let hits = await col.scan(index, bound)
        let records: LogRecord[] = []
        for (let hit of hits) {
            let row = hit.value
            if (!row) continue
            if (filter?.category != null && filter.subsystem == null && row.category !== filter.category) continue
            if (!matchesLevel(row, filter)) continue
            records.push(toRecord(row))
        }
        if (filter?.limit != null) records = records.slice(0, filter.limit)
        return records
    }

    const rotate = async (): Promise<void> => {
        await chain
        await doRotate()
    }

    const clear = async (): Promise<void> => {
        await chain
        await col.clear()
    }

    const flush = async (): Promise<void> => {
        await chain
        await db.flush()
    }

    return { handler, query, rotate, clear, flush }
}
