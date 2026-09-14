import { unknownToError } from "../types"
import { requestIdle, type IdleHandle } from "./idle"

export type BitmapPri = "visible" | "preload"

export type BitmapWorkJob = {
    id: string
    pri: BitmapPri
    source: Blob | ImageBitmapSource
    run?: (ctx: { signal: AbortSignal; bitmap: ImageBitmap }) => Promise<void>
}

export type BitmapWorkQueueStats = {
    active: number
    queued: number
}

export type BitmapWorkQueueOptions = {
    concurrency?: number
    idle?: boolean
    onError?: (error: Error, id: string) => void
}

export type BitmapWorkQueue = {
    enqueue(job: BitmapWorkJob): boolean
    cancel(id: string): boolean
    pause(): void
    resume(): void
    readonly stats: BitmapWorkQueueStats
}

type QueuedJob = {
    id: string
    pri: BitmapPri
    source: Blob | ImageBitmapSource
    run?: BitmapWorkJob["run"]
    idleReady: boolean
    idleHandle?: IdleHandle
}

type ActiveJob = {
    id: string
    controller: AbortController
}

const PRI_ORDER: BitmapPri[] = ["visible", "preload"]

function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === "AbortError"
}

function resolveConcurrency(value: number | undefined): number {
    if (value === undefined) return 1
    let n = Math.floor(value)
    if (!Number.isFinite(n) || n < 1) return 1
    return n
}

function emptyLanes(): Record<BitmapPri, QueuedJob[]> {
    return {
        visible: [],
        preload: [],
    }
}

export function createBitmapWorkQueue(opts?: BitmapWorkQueueOptions): BitmapWorkQueue {
    let concurrency = resolveConcurrency(opts?.concurrency)
    let useIdle = opts?.idle !== false
    let lanes = emptyLanes()
    let queuedPri = new Map<string, BitmapPri>()
    let active = new Map<string, ActiveJob>()
    let paused = false

    function cancelIdle(job: QueuedJob): void {
        job.idleHandle?.cancel()
        job.idleHandle = undefined
    }

    function removeQueued(id: string): QueuedJob | undefined {
        let pri = queuedPri.get(id)
        if (pri === undefined) return undefined
        let lane = lanes[pri]
        let idx = lane.findIndex((job) => job.id === id)
        queuedPri.delete(id)
        if (idx < 0) return undefined
        let job = lane.splice(idx, 1)[0]!
        cancelIdle(job)
        return job
    }

    function scheduleIdle(job: QueuedJob): void {
        cancelIdle(job)
        job.idleReady = false
        job.idleHandle = requestIdle(() => {
            job.idleHandle = undefined
            if (queuedPri.get(job.id) !== job.pri) return
            job.idleReady = true
            if (!paused) pump()
        })
    }

    function pickNext(): QueuedJob | undefined {
        for (let pri of PRI_ORDER) {
            let lane = lanes[pri]
            for (let i = 0; i < lane.length; i++) {
                let job = lane[i]!
                if (!job.idleReady) continue
                lane.splice(i, 1)
                queuedPri.delete(job.id)
                cancelIdle(job)
                return job
            }
        }
        return undefined
    }

    function pump(): void {
        if (paused) return
        while (active.size < concurrency) {
            let job = pickNext()
            if (!job) return
            startJob(job)
        }
    }

    function startJob(job: QueuedJob): void {
        let controller = new AbortController()
        let token: ActiveJob = { id: job.id, controller }
        active.set(job.id, token)

        void (async () => {
            let bitmap: ImageBitmap | undefined
            let reported: Error | undefined
            try {
                let signal = controller.signal
                if (signal.aborted) return
                bitmap = await createImageBitmap(job.source, { signal })
                if (active.get(job.id) !== token || signal.aborted) {
                    bitmap.close()
                    bitmap = undefined
                    return
                }
                if (job.run) {
                    let owned = bitmap
                    bitmap = undefined
                    await job.run({ signal, bitmap: owned })
                } else {
                    bitmap.close()
                    bitmap = undefined
                }
            } catch (err) {
                if (bitmap) {
                    try {
                        bitmap.close()
                    } catch {
                        // ignore close errors on failed decode
                    }
                    bitmap = undefined
                }
                if (!isAbortError(err) && !controller.signal.aborted) {
                    reported = unknownToError(err)
                }
            } finally {
                if (active.get(job.id) === token) {
                    active.delete(job.id)
                } else {
                    reported = undefined
                }
            }
            if (reported) {
                try {
                    opts?.onError?.(reported, job.id)
                } catch {
                    // host onError must not reject the worker
                }
            }
            pump()
        })()
    }

    return {
        enqueue(job: BitmapWorkJob): boolean {
            if (active.has(job.id)) return false
            removeQueued(job.id)
            let queued: QueuedJob = {
                id: job.id,
                pri: job.pri,
                source: job.source,
                run: job.run,
                idleReady: true,
            }
            lanes[job.pri].push(queued)
            queuedPri.set(job.id, job.pri)
            if (useIdle && job.pri === "preload") {
                scheduleIdle(queued)
            } else {
                pump()
            }
            return true
        },
        cancel(id: string): boolean {
            if (removeQueued(id)) return true
            let running = active.get(id)
            if (!running) return false
            running.controller.abort()
            active.delete(id)
            pump()
            return true
        },
        pause(): void {
            paused = true
        },
        resume(): void {
            if (!paused) return
            paused = false
            pump()
        },
        get stats(): BitmapWorkQueueStats {
            return {
                active: active.size,
                queued: queuedPri.size,
            }
        },
    }
}
