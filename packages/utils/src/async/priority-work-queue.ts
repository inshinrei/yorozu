import { unknownToError } from "../types"

export type WorkPri = "visible" | "preload" | "background"

export type PriorityWorkJob = {
    id: string
    pri: WorkPri
    run: (ctx: { signal: AbortSignal }) => Promise<void>
}

export type PriorityWorkQueueStats = {
    active: number
    queued: number
    maxActive: number
}

export type PriorityWorkQueueOptions = {
    concurrency?: number
    onError?: (error: Error, id: string) => void
}

export type PriorityWorkQueue = {
    enqueue(job: PriorityWorkJob): boolean
    cancel(id: string): boolean
    cancelAll(): void
    isBusy(id: string): boolean
    get stats(): PriorityWorkQueueStats
}

type QueuedJob = PriorityWorkJob

type ActiveJob = {
    id: string
    controller: AbortController
}

const PRI_ORDER: WorkPri[] = ["visible", "preload", "background"]

function isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === "AbortError"
}

function emptyLanes(): Record<WorkPri, QueuedJob[]> {
    return {
        visible: [],
        preload: [],
        background: [],
    }
}

export function createPriorityWorkQueue(opts?: PriorityWorkQueueOptions): PriorityWorkQueue {
    let concurrency = Math.max(1, opts?.concurrency ?? 3)
    let lanes = emptyLanes()
    let queuedPri = new Map<string, WorkPri>()
    let active = new Map<string, ActiveJob>()
    let maxActive = 0

    function queuedCount(): number {
        return queuedPri.size
    }

    function removeQueued(id: string): QueuedJob | undefined {
        let pri = queuedPri.get(id)
        if (pri === undefined) return undefined
        let lane = lanes[pri]
        let idx = lane.findIndex((job) => job.id === id)
        queuedPri.delete(id)
        if (idx < 0) return undefined
        return lane.splice(idx, 1)[0]
    }

    function pickNext(): QueuedJob | undefined {
        for (let pri of PRI_ORDER) {
            let lane = lanes[pri]
            while (lane.length > 0) {
                let job = lane.shift()!
                queuedPri.delete(job.id)
                if (active.has(job.id)) continue
                return job
            }
        }
        return undefined
    }

    function pump(): void {
        while (active.size < concurrency) {
            let job = pickNext()
            if (!job) return
            startJob(job)
        }
    }

    function startJob(job: QueuedJob): void {
        let controller = new AbortController()
        active.set(job.id, { id: job.id, controller })
        if (active.size > maxActive) maxActive = active.size

        void (async () => {
            let reported: Error | undefined
            try {
                await job.run({ signal: controller.signal })
            } catch (err) {
                if (!isAbortError(err)) reported = unknownToError(err)
            } finally {
                active.delete(job.id)
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
        enqueue(job: PriorityWorkJob): boolean {
            if (active.has(job.id)) return false
            removeQueued(job.id)
            lanes[job.pri].push({ id: job.id, pri: job.pri, run: job.run })
            queuedPri.set(job.id, job.pri)
            pump()
            return true
        },
        cancel(id: string): boolean {
            if (removeQueued(id)) return true
            let running = active.get(id)
            if (!running) return false
            running.controller.abort()
            return true
        },
        cancelAll(): void {
            lanes = emptyLanes()
            queuedPri.clear()
            for (let running of active.values()) {
                running.controller.abort()
            }
        },
        isBusy(id: string): boolean {
            return active.has(id) || queuedPri.has(id)
        },
        get stats(): PriorityWorkQueueStats {
            return {
                active: active.size,
                queued: queuedCount(),
                maxActive,
            }
        },
    }
}
