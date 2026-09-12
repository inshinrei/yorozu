export type MediaDecodeRole = "active" | "peek-older" | "peek-newer" | "thumb"

export type MediaDecodeRequest = {
    id: string
    role: MediaDecodeRole
    src: string
    signal: AbortSignal
}

export type MediaDecodeBudget = {
    active: number
    peek: number
    thumb: number
}

export const DEFAULT_DECODE_BUDGET_ACTIVE: number = 1
export const DEFAULT_DECODE_BUDGET_PEEK: number = 2
export const DEFAULT_DECODE_BUDGET_THUMB: number = 4

export type MediaDecodePort = {
    request(args: {
        id: string
        role: MediaDecodeRole
        src: string
        decode: (req: MediaDecodeRequest) => Promise<CanvasImageSource | null>
    }): Promise<CanvasImageSource | null>
    abort(id: string): void
    abortRole(role: MediaDecodeRole): void
    abortExcept(keep: Iterable<string>): void
    pausePeeksAndThumbs(): void
    resume(): void
    isPaused(): boolean
    inflight(): { id: string; role: MediaDecodeRole }[]
    destroy(): void
}

type DecodeBucket = "active" | "peek" | "thumb"

const DECODE_BUCKETS: DecodeBucket[] = ["active", "peek", "thumb"]

type DecodeJob = {
    id: string
    role: MediaDecodeRole
    src: string
    decode: (req: MediaDecodeRequest) => Promise<CanvasImageSource | null>
    controller: AbortController
    settle: (value: CanvasImageSource | null) => void
}

function bucketOf(role: MediaDecodeRole): DecodeBucket {
    if (role === "active") return "active"
    if (role === "thumb") return "thumb"
    return "peek"
}

function resolveBudget(partial?: Partial<MediaDecodeBudget>): MediaDecodeBudget {
    return {
        active: partial?.active ?? DEFAULT_DECODE_BUDGET_ACTIVE,
        peek: partial?.peek ?? DEFAULT_DECODE_BUDGET_PEEK,
        thumb: partial?.thumb ?? DEFAULT_DECODE_BUDGET_THUMB,
    }
}

export function createMediaDecodePort(opts?: { budget?: Partial<MediaDecodeBudget> }): MediaDecodePort {
    let budget = resolveBudget(opts?.budget)
    let alive = true
    let paused = false
    let running = new Map<string, DecodeJob>()
    let queues: Record<DecodeBucket, DecodeJob[]> = {
        active: [],
        peek: [],
        thumb: [],
    }

    function settleJob(job: DecodeJob, value: CanvasImageSource | null): void {
        job.settle(value)
    }

    function removeQueued(id: string): DecodeJob | undefined {
        for (let bucket of DECODE_BUCKETS) {
            let lane = queues[bucket]
            let idx = lane.findIndex((job) => job.id === id)
            if (idx < 0) continue
            return lane.splice(idx, 1)[0]
        }
        return undefined
    }

    function runningCount(bucket: DecodeBucket): number {
        let n = 0
        for (let job of running.values()) {
            if (bucketOf(job.role) === bucket) n += 1
        }
        return n
    }

    function canStart(bucket: DecodeBucket): boolean {
        if (!alive) return false
        if (paused && bucket !== "active") return false
        return runningCount(bucket) < budget[bucket]
    }

    function dropJob(job: DecodeJob): void {
        settleJob(job, null)
        if (!job.controller.signal.aborted) job.controller.abort()
    }

    function abortId(id: string): boolean {
        let queued = removeQueued(id)
        if (queued) {
            dropJob(queued)
            return false
        }
        let job = running.get(id)
        if (!job) return false
        running.delete(id)
        dropJob(job)
        return true
    }

    function finish(job: DecodeJob, value: CanvasImageSource | null): void {
        if (running.get(job.id) !== job) return
        running.delete(job.id)
        settleJob(job, job.controller.signal.aborted ? null : value)
        pump()
    }

    function start(job: DecodeJob): void {
        running.set(job.id, job)
        let req: MediaDecodeRequest = {
            id: job.id,
            role: job.role,
            src: job.src,
            signal: job.controller.signal,
        }
        let result: Promise<CanvasImageSource | null>
        try {
            result = Promise.resolve(job.decode(req))
        } catch {
            finish(job, null)
            return
        }
        void result.then(
            (out: CanvasImageSource | null): void => {
                finish(job, out)
            },
            (): void => {
                finish(job, null)
            },
        )
    }

    function pump(): void {
        if (!alive) return
        for (let bucket of DECODE_BUCKETS) {
            while (canStart(bucket) && queues[bucket].length > 0) {
                let job = queues[bucket].shift()
                if (!job) break
                start(job)
            }
        }
    }

    function enqueueOrStart(job: DecodeJob): void {
        let bucket = bucketOf(job.role)
        if (canStart(bucket)) {
            start(job)
            return
        }
        queues[bucket].push(job)
    }

    function request(args: {
        id: string
        role: MediaDecodeRole
        src: string
        decode: (req: MediaDecodeRequest) => Promise<CanvasImageSource | null>
    }): Promise<CanvasImageSource | null> {
        return new Promise((resolve) => {
            let settled = false
            const settle = (value: CanvasImageSource | null): void => {
                if (settled) return
                settled = true
                resolve(value)
            }
            abortId(args.id)
            if (!alive) {
                settle(null)
                return
            }
            let job: DecodeJob = {
                id: args.id,
                role: args.role,
                src: args.src,
                decode: args.decode,
                controller: new AbortController(),
                settle,
            }
            enqueueOrStart(job)
        })
    }

    function abort(id: string): void {
        abortId(id)
        pump()
    }

    function abortRole(role: MediaDecodeRole): void {
        let ids: string[] = []
        for (let job of running.values()) {
            if (job.role === role) ids.push(job.id)
        }
        for (let job of queues[bucketOf(role)]) {
            if (job.role === role) ids.push(job.id)
        }
        for (let id of ids) abortId(id)
        pump()
    }

    function abortExcept(keep: Iterable<string>): void {
        let keepSet = new Set(keep)
        let ids: string[] = []
        for (let id of running.keys()) {
            if (!keepSet.has(id)) ids.push(id)
        }
        for (let bucket of DECODE_BUCKETS) {
            for (let job of queues[bucket]) {
                if (!keepSet.has(job.id)) ids.push(job.id)
            }
        }
        for (let id of ids) abortId(id)
        pump()
    }

    function pausePeeksAndThumbs(): void {
        paused = true
    }

    function resume(): void {
        if (!paused) return
        paused = false
        pump()
    }

    function isPaused(): boolean {
        return paused
    }

    function inflight(): { id: string; role: MediaDecodeRole }[] {
        let out: { id: string; role: MediaDecodeRole }[] = []
        for (let job of running.values()) {
            out.push({ id: job.id, role: job.role })
        }
        return out
    }

    function destroy(): void {
        alive = false
        let ids = [...running.keys()]
        for (let bucket of DECODE_BUCKETS) {
            for (let job of queues[bucket]) ids.push(job.id)
        }
        for (let id of ids) abortId(id)
    }

    return {
        request,
        abort,
        abortRole,
        abortExcept,
        pausePeeksAndThumbs,
        resume,
        isPaused,
        inflight,
        destroy,
    }
}

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
        return { width: source.videoWidth || source.width, height: source.videoHeight || source.height }
    }
    if (typeof SVGImageElement !== "undefined" && source instanceof SVGImageElement) {
        return { width: source.width.baseVal.value, height: source.height.baseVal.value }
    }
    let width = Number((source as { width?: number }).width)
    let height = Number((source as { height?: number }).height)
    if (!Number.isFinite(width) || width < 0) width = 0
    if (!Number.isFinite(height) || height < 0) height = 0
    return { width, height }
}

function markMediaNode(el: HTMLElement, opts: { peek?: boolean; stage?: boolean }): void {
    if (opts.peek) el.setAttribute("data-yorozu-media-peek", "")
    else el.removeAttribute("data-yorozu-media-peek")
    if (opts.stage) el.setAttribute("data-yorozu-media-stage", "")
    else el.removeAttribute("data-yorozu-media-stage")
}

export function applyCanvasImageSource(
    parent: HTMLElement,
    source: CanvasImageSource,
    opts: { peek?: boolean; stage?: boolean; alt?: string },
): HTMLElement {
    if (source instanceof HTMLImageElement) {
        markMediaNode(source, opts)
        source.draggable = false
        if (opts.alt !== undefined) source.alt = opts.alt
        parent.append(source)
        return source
    }
    let canvas = document.createElement("canvas")
    markMediaNode(canvas, opts)
    let size = sourceSize(source)
    canvas.width = size.width
    canvas.height = size.height
    if (typeof CanvasRenderingContext2D !== "undefined" && typeof canvas.getContext === "function") {
        let ctx = canvas.getContext("2d")
        if (ctx) ctx.drawImage(source, 0, 0)
    }
    parent.append(canvas)
    return canvas
}
