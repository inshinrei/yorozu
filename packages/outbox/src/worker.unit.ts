import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestLog, expectFlowStory } from "@yorozu/log"
import { timers } from "@yorozu/utils"
import { mutableClock } from "./_contract"
import { openMemoryOutbox } from "./memory"
import { OUTBOX_MAX_FAILED_AGE_MS } from "./prune"
import type { Clock, OutboxEntry, OutboxStore } from "./types"
import { OutboxWorker, type OutboxHandler } from "./worker"

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
    return {
        id: "e1",
        createdAt: 1_000_000,
        reservedTo: 0,
        type: "test/msg",
        payload: { a: 1 },
        attempts: 1,
        ...overrides,
    }
}

async function flushMicrotasks(times: number = 40): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve()
}

type RepoHarness = {
    store: OutboxStore
    state: { items: OutboxEntry[] }
    claimSpy: ReturnType<typeof vi.fn>
    deleteSpy: ReturnType<typeof vi.fn>
    releaseSpy: ReturnType<typeof vi.fn>
    updateAfterFailureSpy: ReturnType<typeof vi.fn>
    markFailedSpy: ReturnType<typeof vi.fn>
    releaseUncountedSpy: ReturnType<typeof vi.fn>
    listFailedSpy: ReturnType<typeof vi.fn>
}

function makeRepo(initial: OutboxEntry[] = [], clock: Clock = { now: () => Date.now() }): RepoHarness {
    let state = { items: initial.map((e) => ({ ...e })) }
    let listeners = new Set<() => void>()
    let claimSpy = vi.fn()
    let deleteSpy = vi.fn()
    let releaseSpy = vi.fn()
    let updateAfterFailureSpy = vi.fn()
    let markFailedSpy = vi.fn()
    let releaseUncountedSpy = vi.fn()
    let listFailedSpy = vi.fn()

    let store: OutboxStore = {
        enqueue: vi.fn(async () => "id"),
        get: vi.fn(async (id: string) => {
            let found = state.items.find((e) => e.id === id)
            return found ? { ...found } : null
        }),
        claim: claimSpy,
        delete: deleteSpy,
        release: releaseSpy,
        updateAfterFailure: updateAfterFailureSpy,
        markFailed: markFailedSpy,
        listFailed: listFailedSpy,
        retry: vi.fn(async () => {}),
        releaseUncounted: releaseUncountedSpy,
        deleteAll: vi.fn(async () => {
            state.items = []
        }),
        count: vi.fn(async () => state.items.length),
        subscribe: vi.fn((fn: () => void): (() => void) => {
            listeners.add(fn)
            return (): void => {
                listeners.delete(fn)
            }
        }),
        nextDueAt: vi.fn(async (): Promise<number | null> => {
            let best: number | null = null
            for (let entry of state.items) {
                if (entry.failedAt != null) continue
                if (best == null || entry.reservedTo < best) best = entry.reservedTo
            }
            return best
        }),
    }

    claimSpy.mockImplementation(async (lease: number) => {
        let now = clock.now()
        let idx = state.items.findIndex((e) => e.failedAt == null && e.reservedTo <= now)
        if (idx === -1) return null
        let e = state.items[idx]!
        let updated: OutboxEntry = { ...e, reservedTo: now + lease, attempts: e.attempts + 1 }
        state.items[idx] = updated
        return { ...updated }
    })
    deleteSpy.mockImplementation(async (id: string) => {
        state.items = state.items.filter((x) => x.id !== id)
    })
    releaseSpy.mockImplementation(async (id: string) => {
        let i = state.items.findIndex((x) => x.id === id)
        if (i !== -1) state.items[i] = { ...state.items[i]!, reservedTo: 0 }
    })
    updateAfterFailureSpy.mockImplementation(async (id: string, error: string, nextReservedTo?: number) => {
        let i = state.items.findIndex((x) => x.id === id)
        if (i !== -1) {
            state.items[i] = {
                ...state.items[i]!,
                lastError: error,
                reservedTo: nextReservedTo ?? state.items[i]!.reservedTo,
            }
        }
    })
    markFailedSpy.mockImplementation(async (id: string, error?: string) => {
        let i = state.items.findIndex((x) => x.id === id)
        if (i !== -1) {
            state.items[i] = {
                ...state.items[i]!,
                failedAt: clock.now(),
                lastError: error,
                reservedTo: Number.MAX_SAFE_INTEGER,
            }
        }
    })
    releaseUncountedSpy.mockImplementation(async (id: string, error?: string, nextReservedTo?: number) => {
        let i = state.items.findIndex((x) => x.id === id)
        if (i !== -1) {
            state.items[i] = {
                ...state.items[i]!,
                attempts: Math.max(0, state.items[i]!.attempts - 1),
                lastError: error,
                reservedTo: nextReservedTo ?? 0,
            }
        }
    })
    listFailedSpy.mockImplementation(async () => state.items.filter((e) => e.failedAt != null).map((e) => ({ ...e })))

    return {
        store,
        state,
        claimSpy,
        deleteSpy,
        releaseSpy,
        updateAfterFailureSpy,
        markFailedSpy,
        releaseUncountedSpy,
        listFailedSpy,
    }
}

describe("OutboxWorker", () => {
    let processSpy: ReturnType<typeof vi.fn<(entry: OutboxEntry) => Promise<void>>>
    let rollbackSpy: ReturnType<typeof vi.fn<(entry: OutboxEntry) => Promise<void>>>
    let handlers: Record<string, OutboxHandler>
    let workers: OutboxWorker[]

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
        workers = []
        processSpy = vi.fn(async (_entry: OutboxEntry): Promise<void> => {})
        rollbackSpy = vi.fn(async (_entry: OutboxEntry): Promise<void> => {})
        handlers = {
            "test/msg": { process: processSpy, rollback: rollbackSpy },
            "test/no-rollback": {
                process: vi.fn(async (): Promise<void> => {
                    throw new Error("fail")
                }),
            },
        }
    })

    afterEach(() => {
        for (let w of workers) w.stop()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    function track(w: OutboxWorker): OutboxWorker {
        workers.push(w)
        return w
    }

    async function startUntilIdle(w: OutboxWorker): Promise<void> {
        w.start()
        await flushMicrotasks()
    }

    it("start processes claimed entry and deletes on success", async () => {
        let { store, state, deleteSpy } = makeRepo([makeEntry()])
        let log = createTestLog()
        let w = track(new OutboxWorker(store, handlers, { log, pollIntervalMs: 10 }))
        await startUntilIdle(w)
        expect(deleteSpy).toHaveBeenCalledWith("e1")
        expect(processSpy).toHaveBeenCalledTimes(1)
        expect(state.items).toHaveLength(0)
        expectFlowStory(log.collect(), "outbox-process", ["start", "done"])
    })

    it("logs delete failure after successful process and does not backoff or exhaust", async () => {
        let { store, deleteSpy, updateAfterFailureSpy, markFailedSpy } = makeRepo([makeEntry()])
        deleteSpy.mockRejectedValueOnce(new Error("delete failed"))
        let log = createTestLog()
        let w = track(new OutboxWorker(store, handlers, { log, pollIntervalMs: 10, maxAttempts: 5 }))
        await startUntilIdle(w)
        expect(processSpy).toHaveBeenCalledTimes(1)
        expect(updateAfterFailureSpy).not.toHaveBeenCalled()
        expect(markFailedSpy).not.toHaveBeenCalled()
        expect(rollbackSpy).not.toHaveBeenCalled()
        expect(log.collect().some((r) => r.errorMeta?.issueKey === "yorozu-outbox")).toBe(true)
        expectFlowStory(log.collect(), "outbox-process", ["start", "done"])
    })

    it("backs off (not release) on failure below maxAttempts", async () => {
        let clock: Clock = { now: () => Date.now() }
        let { store, releaseSpy, updateAfterFailureSpy } = makeRepo([makeEntry({ attempts: 1 })], clock)
        processSpy.mockRejectedValueOnce(new Error("temp"))
        let log = createTestLog()
        let w = track(
            new OutboxWorker(store, handlers, {
                pollIntervalMs: 10,
                maxAttempts: 5,
                retryBaseMs: 1000,
                retryCapMs: 30_000,
                log,
                clock,
            }),
        )
        await startUntilIdle(w)
        expect(updateAfterFailureSpy).toHaveBeenCalledWith("e1", expect.any(String), expect.any(Number))
        expect(releaseSpy).not.toHaveBeenCalled()
        let nextReservedTo = updateAfterFailureSpy.mock.calls[0]![2] as number
        expect(nextReservedTo).toBeGreaterThan(clock.now())
        expectFlowStory(log.collect(), "outbox-process", ["start", "retry"])
    })

    it("writes backoff reservedTo from the injected clock, not Date.now", async () => {
        let now = 5_000_000
        let clock: Clock = { now: () => now }
        let { store, updateAfterFailureSpy } = makeRepo([makeEntry({ attempts: 0 })], clock)
        processSpy.mockRejectedValueOnce(new Error("temp"))
        vi.spyOn(Math, "random").mockReturnValue(0)
        let w = track(
            new OutboxWorker(store, handlers, {
                pollIntervalMs: 10,
                retryBaseMs: 1000,
                retryCapMs: 30_000,
                log: createTestLog(),
                clock,
            }),
        )
        await startUntilIdle(w)
        let nextReservedTo = updateAfterFailureSpy.mock.calls[0]![2] as number
        expect(nextReservedTo).toBe(now + 1000)
        expect(nextReservedTo).not.toBe(Date.now() + 1000)
    })

    it("retry delay grows exponentially per attempt up to the cap", async () => {
        let base = 5
        let cap = 40
        let clock: Clock = { now: () => Date.now() }
        let { store, state, updateAfterFailureSpy } = makeRepo([makeEntry({ attempts: 1 })], clock)
        processSpy.mockRejectedValue(new Error("always"))
        vi.spyOn(Math, "random").mockReturnValue(0)
        let delays: number[] = []
        updateAfterFailureSpy.mockImplementation(async (id: string, error: string, nextReservedTo?: number) => {
            if (nextReservedTo != null) delays.push(nextReservedTo - clock.now())
            let i = state.items.findIndex((x) => x.id === id)
            if (i !== -1) {
                state.items[i] = {
                    ...state.items[i]!,
                    lastError: error,
                    reservedTo: nextReservedTo ?? state.items[i]!.reservedTo,
                }
            }
        })
        let w = track(
            new OutboxWorker(store, handlers, {
                log: createTestLog(),
                pollIntervalMs: 5,
                maxAttempts: 5,
                retryBaseMs: base,
                retryCapMs: cap,
                clock,
            }),
        )
        w.start()
        for (let i = 0; i < 80 && state.items.length > 0; i++) {
            await flushMicrotasks(15)
            if (state.items.length === 0) break
            await vi.advanceTimersByTimeAsync(5)
        }
        w.stop()

        expect(state.items).toHaveLength(0)
        expect(delays.length).toBeGreaterThanOrEqual(3)
        expect(delays[1]!).toBeGreaterThan(delays[0]!)
        expect(delays[2]!).toBeGreaterThan(delays[1]!)
        for (let d of delays) expect(d).toBeLessThanOrEqual(cap)
        expect(delays[0]).toBe(base * 2 ** (2 - 1))
        expect(delays[1]).toBe(base * 2 ** (3 - 1))
        expect(delays[2]).toBe(Math.min(base * 2 ** (4 - 1), cap))
    })

    it("calls rollback and deletes when attempts reach max", async () => {
        let { store, state, deleteSpy } = makeRepo([makeEntry({ attempts: 4 })])
        processSpy.mockRejectedValueOnce(new Error("boom"))
        let log = createTestLog()
        let w = track(new OutboxWorker(store, handlers, { log, pollIntervalMs: 10, maxAttempts: 5 }))
        await startUntilIdle(w)
        expect(deleteSpy).toHaveBeenCalledWith("e1")
        expect(rollbackSpy).toHaveBeenCalledTimes(1)
        expect(state.items).toHaveLength(0)
        expectFlowStory(log.collect(), "outbox-process", ["start", "error"])
    })

    it("marks failed (does NOT delete) at max when handler defines onExhausted", async () => {
        let { store, state, deleteSpy, markFailedSpy } = makeRepo([makeEntry({ type: "test/exhaust", attempts: 4 })])
        let onExhausted = vi.fn(async (_entry: OutboxEntry): Promise<void> => {})
        let exhaustHandlers: Record<string, OutboxHandler> = {
            "test/exhaust": {
                process: vi.fn(async (): Promise<void> => {
                    throw new Error("boom")
                }),
                onExhausted,
            },
        }
        let log = createTestLog()
        let w = track(new OutboxWorker(store, exhaustHandlers, { log, pollIntervalMs: 10, maxAttempts: 5 }))
        await startUntilIdle(w)
        expect(markFailedSpy).toHaveBeenCalledWith("e1", expect.any(String))
        expect(onExhausted).toHaveBeenCalledTimes(1)
        expect(deleteSpy).not.toHaveBeenCalled()
        expect(state.items).toHaveLength(1)
        expect(state.items[0]!.failedAt).toBeGreaterThan(0)
        expect(log.collect().some((r) => r.errorMeta?.issueKey === "yorozu-outbox")).toBe(true)
    })

    it("exhausts immediately on a non-retryable error, regardless of attempts", async () => {
        let { store, markFailedSpy, updateAfterFailureSpy } = makeRepo([
            makeEntry({ type: "test/exhaust", attempts: 1 }),
        ])
        let onExhausted = vi.fn(async (_entry: OutboxEntry): Promise<void> => {})
        let exhaustHandlers: Record<string, OutboxHandler> = {
            "test/exhaust": {
                process: vi.fn(async (): Promise<void> => {
                    throw new Error("bad request")
                }),
                onExhausted,
            },
        }
        let w = track(
            new OutboxWorker(store, exhaustHandlers, {
                log: createTestLog(),
                pollIntervalMs: 10,
                maxAttempts: 5,
                isRetryableError: () => false,
            }),
        )
        await startUntilIdle(w)
        expect(markFailedSpy).toHaveBeenCalledWith("e1", expect.any(String))
        expect(onExhausted).toHaveBeenCalledTimes(1)
        expect(updateAfterFailureSpy).not.toHaveBeenCalled()
    })

    it("does not advance attempts toward the cap on a transient failure while offline", async () => {
        let { store, state, markFailedSpy, releaseUncountedSpy } = makeRepo([
            makeEntry({ type: "test/exhaust", attempts: 4 }),
        ])
        let onExhausted = vi.fn(async (_entry: OutboxEntry): Promise<void> => {})
        let exhaustHandlers: Record<string, OutboxHandler> = {
            "test/exhaust": {
                process: vi.fn(async (): Promise<void> => {
                    throw new Error("network down")
                }),
                onExhausted,
            },
        }
        let log = createTestLog()
        let w = track(
            new OutboxWorker(store, exhaustHandlers, {
                log,
                pollIntervalMs: 10,
                maxAttempts: 5,
                isRetryableError: () => true,
                isOnline: () => false,
            }),
        )
        await startUntilIdle(w)
        expect(releaseUncountedSpy).toHaveBeenCalledWith("e1", expect.any(String))
        expect(markFailedSpy).not.toHaveBeenCalled()
        expect(onExhausted).not.toHaveBeenCalled()
        expect(state.items[0]!.attempts).toBe(4)
        expect(state.items[0]!.failedAt).toBeUndefined()
        expectFlowStory(log.collect(), "outbox-process", ["start", "skip"])
    })

    it("deletes immediately for unknown handler type and warns never-happen", async () => {
        let { store, state, deleteSpy } = makeRepo([makeEntry({ type: "unknown/type" })])
        let log = createTestLog()
        let w = track(new OutboxWorker(store, handlers, { log, pollIntervalMs: 10 }))
        await startUntilIdle(w)
        expect(deleteSpy).toHaveBeenCalledWith("e1")
        expect(state.items).toHaveLength(0)
        expectFlowStory(log.collect(), "outbox-process", ["start", "never-happen"])
    })

    it("stop prevents further processing", async () => {
        let { store } = makeRepo([makeEntry()])
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 5 }))
        w.start()
        w.stop()
        await flushMicrotasks()
        await vi.advanceTimersByTimeAsync(50)
        expect(() => w.stop()).not.toThrow()
    })

    it("pause stops ticks and processing, resume restarts with eager tick", async () => {
        let { store, state, deleteSpy } = makeRepo([])
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 10 }))
        await startUntilIdle(w)
        w.pause()
        state.items.push(makeEntry())
        await vi.advanceTimersByTimeAsync(80)
        await flushMicrotasks()
        expect(deleteSpy).not.toHaveBeenCalled()
        w.resume()
        await flushMicrotasks()
        expect(deleteSpy).toHaveBeenCalledWith("e1")
    })

    it("omitted log uses a silent logger and span still runs process", async () => {
        let { store, deleteSpy } = makeRepo([makeEntry()])
        let w = track(new OutboxWorker(store, handlers, { pollIntervalMs: 10 }))
        await startUntilIdle(w)
        expect(processSpy).toHaveBeenCalledTimes(1)
        expect(deleteSpy).toHaveBeenCalledWith("e1")
    })

    it("prunes old failed entries using the injected clock", async () => {
        let clock = mutableClock(Date.now())
        let store = openMemoryOutbox({ clock })
        let id = await store.enqueue({ type: "f", payload: {} })
        await store.markFailed(id)
        clock.nowMs += OUTBOX_MAX_FAILED_AGE_MS + 1
        let w = track(new OutboxWorker(store, {}, { clock, log: createTestLog(), pollIntervalMs: 10 }))
        await startUntilIdle(w)
        expect(await store.get(id)).toBeNull()
    })

    it("prune: false disables failed-entry hygiene", async () => {
        let clock = mutableClock(Date.now())
        let store = openMemoryOutbox({ clock })
        let id = await store.enqueue({ type: "f", payload: {} })
        await store.markFailed(id)
        clock.nowMs += OUTBOX_MAX_FAILED_AGE_MS + 1
        let w = track(new OutboxWorker(store, {}, { clock, log: createTestLog(), pollIntervalMs: 10, prune: false }))
        await startUntilIdle(w)
        expect(await store.get(id)).not.toBeNull()
    })

    it("drains on store enqueue without waiting for the watchdog", async () => {
        let store = openMemoryOutbox({ clock: { now: () => Date.now() } })
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 30_000 }))
        await startUntilIdle(w)
        expect(processSpy).toHaveBeenCalledTimes(0)
        await store.enqueue({ type: "test/msg", payload: {} })
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(1)
        expect(await store.count()).toBe(0)
    })

    it("does not claim again for 2s when the watchdog is 30s", async () => {
        let { store, claimSpy } = makeRepo([])
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 30_000 }))
        await startUntilIdle(w)
        let n = claimSpy.mock.calls.length
        await vi.advanceTimersByTimeAsync(2000)
        await flushMicrotasks()
        expect(claimSpy.mock.calls.length).toBe(n)
        await vi.advanceTimersByTimeAsync(30_000)
        await flushMicrotasks()
        expect(claimSpy.mock.calls.length).toBeGreaterThan(n)
    })

    it("retries when reservedTo is due, not at the watchdog", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0)
        let clock: Clock = { now: () => Date.now() }
        let store = openMemoryOutbox({ clock })
        processSpy.mockRejectedValueOnce(new Error("temp"))
        let w = track(
            new OutboxWorker(store, handlers, {
                log: createTestLog(),
                pollIntervalMs: 60_000,
                retryBaseMs: 1000,
                retryCapMs: 30_000,
                clock,
            }),
        )
        await store.enqueue({ type: "test/msg", payload: {} })
        await startUntilIdle(w)
        expect(processSpy).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(999)
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(2)
    })

    it("wake drains without waiting for the watchdog", async () => {
        let { store, state, deleteSpy } = makeRepo([])
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 60_000 }))
        await startUntilIdle(w)
        state.items.push(makeEntry())
        w.wake()
        await flushMicrotasks()
        expect(deleteSpy).toHaveBeenCalledWith("e1")
    })

    it("arms a due timer for a leased entry and reclaims when reservedTo is due", async () => {
        let clock: Clock = { now: () => Date.now() }
        let store = openMemoryOutbox({ clock })
        await store.enqueue({ type: "test/msg", payload: {} })
        await store.claim(5000)
        let w = track(
            new OutboxWorker(store, handlers, {
                log: createTestLog(),
                pollIntervalMs: 60_000,
                leaseDurationMs: 5000,
                clock,
            }),
        )
        await startUntilIdle(w)
        expect(processSpy).toHaveBeenCalledTimes(0)
        await vi.advanceTimersByTimeAsync(4999)
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(0)
        await vi.advanceTimersByTimeAsync(1)
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(1)
    })

    it("does not tight-loop claim while offline", async () => {
        let clock: Clock = { now: () => Date.now() }
        let store = openMemoryOutbox({ clock })
        processSpy.mockRejectedValue(new Error("network down"))
        let w = track(
            new OutboxWorker(store, handlers, {
                log: createTestLog(),
                pollIntervalMs: 60_000,
                isOnline: () => false,
                isRetryableError: () => true,
                clock,
            }),
        )
        await store.enqueue({ type: "test/msg", payload: {} })
        await startUntilIdle(w)
        expect(processSpy).toHaveBeenCalledTimes(1)
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(1)
    })

    it("drains when subscribeOnline fires after offline", async () => {
        let online = false
        let onlineListeners = new Set<() => void>()
        let clock: Clock = { now: () => Date.now() }
        let store = openMemoryOutbox({ clock })
        processSpy.mockRejectedValueOnce(new Error("network down"))
        let w = track(
            new OutboxWorker(store, handlers, {
                log: createTestLog(),
                pollIntervalMs: 60_000,
                isOnline: () => online,
                isRetryableError: () => true,
                subscribeOnline: (cb: () => void): (() => void) => {
                    onlineListeners.add(cb)
                    return (): void => {
                        onlineListeners.delete(cb)
                    }
                },
                clock,
            }),
        )
        await store.enqueue({ type: "test/msg", payload: {} })
        await startUntilIdle(w)
        expect(processSpy).toHaveBeenCalledTimes(1)
        processSpy.mockResolvedValue(undefined)
        online = true
        for (let cb of onlineListeners) cb()
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(2)
    })

    it("coalesces a wake that arrives while processing", async () => {
        let store = openMemoryOutbox({ clock: { now: () => Date.now() } })
        let release!: () => void
        processSpy.mockImplementationOnce(async (): Promise<void> => {
            await new Promise<void>((r) => {
                release = r
            })
        })
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 60_000 }))
        await store.enqueue({ type: "test/msg", payload: { n: 1 } })
        w.start()
        await flushMicrotasks()
        await store.enqueue({ type: "test/msg", payload: { n: 2 } })
        release()
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(2)
    })

    it("drains an enqueue that arrives while arming the due timer", async () => {
        let store = openMemoryOutbox({ clock: { now: () => Date.now() } })
        let origNextDueAt = store.nextDueAt.bind(store)
        let releaseDue!: () => void
        store.nextDueAt = async (): Promise<number | null> => {
            await new Promise<void>((r) => {
                releaseDue = r
            })
            return origNextDueAt()
        }
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 60_000 }))
        w.start()
        await flushMicrotasks()
        await store.enqueue({ type: "test/msg", payload: {} })
        expect(processSpy).toHaveBeenCalledTimes(0)
        releaseDue()
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(1)
    })

    it("ignores store notify while paused and drains on resume", async () => {
        let store = openMemoryOutbox({ clock: { now: () => Date.now() } })
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 60_000 }))
        await startUntilIdle(w)
        w.pause()
        await store.enqueue({ type: "test/msg", payload: {} })
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(0)
        w.resume()
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(1)
    })

    it("stop unsubscribes so later enqueue does not process", async () => {
        let store = openMemoryOutbox({ clock: { now: () => Date.now() } })
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog(), pollIntervalMs: 60_000 }))
        await startUntilIdle(w)
        w.stop()
        await store.enqueue({ type: "test/msg", payload: {} })
        await flushMicrotasks()
        expect(processSpy).toHaveBeenCalledTimes(0)
    })

    it("start uses a 30s watchdog by default", async () => {
        let { store } = makeRepo([])
        let spy = vi.spyOn(timers, "setInterval")
        let w = track(new OutboxWorker(store, handlers, { log: createTestLog() }))
        await startUntilIdle(w)
        expect(spy).toHaveBeenCalledWith(expect.any(Function), 30_000)
    })
})
