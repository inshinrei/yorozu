import { makeLog, makeSilentLog, reportFlowFailure, type Logger } from "@yorozu/log"
import { timers } from "@yorozu/utils"
import { resolveClock } from "./ids"
import { OUTBOX_MAX_FAILED, OUTBOX_MAX_FAILED_AGE_MS, pruneOutboxFailed } from "./prune"
import type { Clock, OutboxEntry, OutboxStore } from "./types"

const ISSUE_KEY: string = "yorozu-outbox"

export type OutboxHandler = {
    process: (entry: OutboxEntry) => Promise<void>
    /**
     * Revert an optimistic mutation that can no longer succeed (e.g. restore a reaction).
     * Runs at exhaustion only when no `onExhausted` is defined; the entry is then deleted.
     */
    rollback?: (entry: OutboxEntry) => Promise<void>
    /**
     * Called when the entry reaches a terminal failure. When defined, the worker marks the
     * entry `failed` (retained, not deleted) instead of rolling back+deleting, so the action
     * stays visible and can be manually retried/discarded.
     */
    onExhausted?: (entry: OutboxEntry) => Promise<void>
}

export type OutboxWorkerOptions = {
    pollIntervalMs?: number
    leaseDurationMs?: number
    maxAttempts?: number
    /** Base delay for exponential retry backoff, in ms. Default 1000. */
    retryBaseMs?: number
    /** Cap for exponential retry backoff, in ms. Default 30_000. */
    retryCapMs?: number
    /**
     * Reports whether the network is currently up. Transient failures observed while offline do
     * not advance the terminal attempt cap (they're not real failures). Defaults to always-online.
     */
    isOnline?: () => boolean
    /** Host-level online signal (e.g. `window` `online`). If omitted, offline→online waits for `wake()` or the watchdog. */
    subscribeOnline?: (onOnline: () => void) => () => void
    /**
     * Classifies an error as retryable (transient: network/5xx/429 → keep retrying) vs.
     * non-retryable (terminal: 4xx → fail now). Defaults to treating every error as retryable.
     */
    isRetryableError?: (err: unknown) => boolean
    log?: Logger
    clock?: Clock
    /**
     * Invoked after a tick that claimed at least one entry (success, retry, or exhaust).
     */
    onActivity?: () => void
    /** Failed-entry hygiene. Default 90d / 200. `false` disables. */
    prune?: { maxAgeMs: number; maxCount: number } | false
}

export class OutboxWorker {
    protected _watchdog: timers.Interval | null = null
    protected _dueTimer: timers.Timer | null = null
    protected _wakePending: boolean = false
    protected _unsubStore: (() => void) | null = null
    protected _unsubOnline: (() => void) | null = null
    protected _running: boolean = false
    protected _paused: boolean = false
    protected _processing: boolean = false
    protected log: Logger
    protected _clock: Clock

    constructor(
        protected readonly store: OutboxStore,
        protected readonly handlers: Record<string, OutboxHandler>,
        protected readonly options: OutboxWorkerOptions = {},
    ) {
        this.log = makeLog(options.log ?? makeSilentLog(), ISSUE_KEY)
        this._clock = resolveClock(options.clock)
    }

    wake(): void {
        if (!this._running || this._paused) return
        if (this._processing) {
            this._wakePending = true
            return
        }
        this._runTick()
    }

    start(): void {
        if (this._running) return
        this._running = true
        this._paused = false
        this._unsubStore = this.store.subscribe(() => {
            this.wake()
        })
        this._unsubOnline = this.options.subscribeOnline
            ? this.options.subscribeOnline(() => {
                  this.wake()
              })
            : null
        this._armWatchdog()
        this.wake()
    }

    stop(): void {
        this._running = false
        this._paused = false
        this._wakePending = false
        this._unsubscribe()
        this._clearWatchdog()
        this._clearDueTimer()
    }

    pause(): void {
        if (!this._running || this._paused) return
        this._paused = true
        this._clearWatchdog()
        this._clearDueTimer()
    }

    resume(): void {
        if (!this._running || !this._paused) return
        this._paused = false
        this._armWatchdog()
        this.wake()
    }

    protected _unsubscribe(): void {
        this._unsubStore?.()
        this._unsubStore = null
        this._unsubOnline?.()
        this._unsubOnline = null
    }

    protected _armWatchdog(): void {
        this._clearWatchdog()
        let interval = this.options.pollIntervalMs ?? 30_000
        this.log.trace("outbox: watchdog", { intervalMs: interval })
        this._watchdog = timers.setInterval(() => {
            this.wake()
        }, interval)
    }

    protected _clearWatchdog(): void {
        if (this._watchdog) {
            timers.clearInterval(this._watchdog)
            this._watchdog = null
        }
    }

    protected _clearDueTimer(): void {
        if (this._dueTimer) {
            timers.clearTimeout(this._dueTimer)
            this._dueTimer = null
        }
    }

    protected async _armDueTimer(): Promise<void> {
        this._clearDueTimer()
        if (!this._running || this._paused) return
        let due: number | null
        try {
            due = await this.store.nextDueAt()
        } catch (err) {
            this._report(err)
            return
        }
        if (due == null || !this._running || this._paused) return
        let delay = due - this._clock.now()
        if (delay <= 0) return
        this._dueTimer = timers.setTimeout(() => {
            this.wake()
        }, delay)
    }

    protected _runTick(): void {
        this._tick().catch((e) => this._report(e))
    }

    protected _report(err: unknown): void {
        if (err instanceof Error) this.log.error(err)
        else this.log.warn("never-happen", { err })
    }

    protected async _prune(): Promise<void> {
        if (this.options.prune === false) return
        let limits = this.options.prune
        await pruneOutboxFailed(this.store, this.log, {
            clock: this._clock,
            maxAgeMs: limits?.maxAgeMs ?? OUTBOX_MAX_FAILED_AGE_MS,
            maxCount: limits?.maxCount ?? OUTBOX_MAX_FAILED,
        }).catch((e) => this._report(e))
    }

    protected async _tick(): Promise<void> {
        if (this._processing || !this._running || this._paused) return
        this._processing = true
        let didWork = false
        try {
            let lease = this.options.leaseDurationMs ?? 30_000
            let max = this.options.maxAttempts ?? 5
            this.log.trace("outbox: tick start")
            while (this._running && !this._paused) {
                let entry = await this.store.claim(lease)
                if (!entry) {
                    this.log.trace("outbox: no claimable entries")
                    break
                }
                didWork = true

                this.log.trace("outbox: claimed", { type: entry.type, id: entry.id, attempts: entry.attempts })
                let flow = this.log.flow("outbox-process", { id: entry.id, type: entry.type, attempt: entry.attempts })
                flow.info("start", { id: entry.id, type: entry.type, attempt: entry.attempts })
                let h = this.handlers[entry.type]
                if (!h) {
                    flow.warn("never-happen", { reason: "no-handler", type: entry.type })
                    this.log.trace("outbox: no handler for type, deleting", { type: entry.type })
                    await this.store.delete(entry.id)
                    continue
                }

                try {
                    await flow.span("process " + entry.type, () => h.process(entry))
                } catch (err) {
                    let errMsg = err instanceof Error ? err.message : String(err)
                    let attempts = entry.attempts
                    let retryable = this.options.isRetryableError ? this.options.isRetryableError(err) : true
                    let online = this.options.isOnline ? this.options.isOnline() : true

                    if (!retryable) {
                        this.log.trace("outbox: non-retryable error, exhausting", { type: entry.type })
                        await this._exhaust(entry, h, errMsg)
                        reportFlowFailure(flow, err, { id: entry.id, type: entry.type, outcome: "exhausted" })
                    } else if (!online) {
                        flow.warn("skip", { reason: "offline", id: entry.id, type: entry.type })
                        this.log.trace("outbox: transient failure while offline, not counting", { type: entry.type })
                        await Promise.resolve(this.store.releaseUncounted(entry.id, errMsg)).catch((e) => {
                            this._report(e)
                        })
                        break
                    } else if (attempts >= max) {
                        this.log.trace("outbox: max attempts, exhausting", { type: entry.type })
                        await this._exhaust(entry, h, errMsg)
                        reportFlowFailure(flow, err, { id: entry.id, type: entry.type, outcome: "exhausted" })
                    } else {
                        let base = this.options.retryBaseMs ?? 1000
                        let cap = this.options.retryCapMs ?? 30_000
                        let delay = Math.min(base * 2 ** (attempts - 1), cap)
                        let jitter = Math.floor(delay * 0.2 * Math.random())
                        let nextReservedTo = this._clock.now() + delay - jitter
                        flow.warn("retry", { id: entry.id, type: entry.type, attempt: attempts, delayMs: delay })
                        this.log.trace("outbox: backing off for retry", { type: entry.type, delayMs: delay })
                        await Promise.resolve(this.store.updateAfterFailure(entry.id, errMsg, nextReservedTo)).catch(
                            (e) => {
                                this._report(e)
                            },
                        )
                    }
                    continue
                }
                try {
                    await this.store.delete(entry.id)
                } catch (err) {
                    this._report(err)
                }
                flow.info("done", { id: entry.id, type: entry.type })
            }
            await this._prune()
            this.log.trace("outbox: tick end")
            if (didWork) {
                try {
                    this.options.onActivity?.()
                } catch (actErr) {
                    this._report(actErr)
                }
            }
        } finally {
            if (this._running && !this._paused) {
                await this._armDueTimer()
            } else {
                this._clearDueTimer()
            }
            this._processing = false
            if (this._wakePending) {
                this._wakePending = false
                let online = this.options.isOnline ? this.options.isOnline() : true
                if (online) this.wake()
            }
        }
    }

    /**
     * Terminal disposition for an entry. If the handler defines `onExhausted`, run it and mark the
     * entry `failed` (retained, surfaced for manual retry/discard). Otherwise fall back to the
     * legacy rollback+delete (e.g. reactions revert their optimistic state and the entry is dropped).
     */
    protected async _exhaust(entry: OutboxEntry, h: OutboxHandler, errMsg: string): Promise<void> {
        if (h.onExhausted) {
            try {
                await h.onExhausted(entry)
            } catch (exErr) {
                this._report(exErr)
            }
            await Promise.resolve(this.store.markFailed(entry.id, errMsg)).catch((e) => {
                this._report(e)
            })
            await this._prune()
            return
        }
        if (h.rollback) {
            try {
                await h.rollback(entry)
            } catch (rbErr) {
                this._report(rbErr)
            }
        }
        await this.store.delete(entry.id)
    }
}
