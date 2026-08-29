import type { Logger } from "@yorozu/log"
import { resolveClock } from "./ids"
import type { Clock, OutboxEntry, OutboxStore } from "./types"

export const OUTBOX_MAX_FAILED_AGE_MS: number = 90 * 24 * 60 * 60 * 1000
export const OUTBOX_MAX_FAILED: number = 200

export type PruneOutboxFailedOpts = {
    maxAgeMs?: number
    maxCount?: number
    clock?: Clock
}

function reportCaught(log: Logger, err: unknown): void {
    if (err instanceof Error) log.error(err)
    else log.warn("never-happen", { err })
}

/** Prune only failed entries by age then excess count. Never touches non-failed (undelivered) jobs. */
export async function pruneOutboxFailed(store: OutboxStore, log: Logger, opts?: PruneOutboxFailedOpts): Promise<void> {
    let clock = resolveClock(opts?.clock)
    let maxAgeMs = opts?.maxAgeMs ?? OUTBOX_MAX_FAILED_AGE_MS
    let maxCount = opts?.maxCount ?? OUTBOX_MAX_FAILED
    let failed: OutboxEntry[]
    try {
        failed = await store.listFailed()
    } catch (e) {
        reportCaught(log, e)
        return
    }
    if (!failed.length) return
    let now = clock.now()
    let toDelete: string[] = []
    for (let e of failed) {
        if (e.failedAt != null && now - e.failedAt > maxAgeMs) {
            toDelete.push(e.id)
        }
    }
    let remaining = failed.filter((e) => !toDelete.includes(e.id))
    if (remaining.length > maxCount) {
        remaining = [...remaining].sort((a, b) => (a.failedAt ?? a.createdAt) - (b.failedAt ?? b.createdAt))
        let excess = remaining.length - maxCount
        for (let i = 0; i < excess; i++) {
            toDelete.push(remaining[i]!.id)
        }
    }
    for (let id of toDelete) {
        try {
            await store.delete(id)
        } catch (err) {
            reportCaught(log, err)
        }
    }
}
