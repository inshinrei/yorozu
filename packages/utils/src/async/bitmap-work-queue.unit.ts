import { afterEach, describe, expect, it, vi } from "vitest"
import { createBitmapWorkQueue } from "./bitmap-work-queue"

type Gate = { promise: Promise<void>; resolve: () => void }

function gate(): Gate {
    let resolve!: () => void
    let promise = new Promise<void>((res) => {
        resolve = () => res()
    })
    return { promise, resolve }
}

function fakeBitmap(): ImageBitmap {
    return { close: vi.fn() } as unknown as ImageBitmap
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe("createBitmapWorkQueue", () => {
    it("default concurrency is 1; floor then min 1", async () => {
        let decode = vi.fn(async () => fakeBitmap())
        vi.stubGlobal("createImageBitmap", decode)
        let q = createBitmapWorkQueue({ idle: false })
        let g1 = gate()
        let g2 = gate()
        let started = 0
        q.enqueue({
            id: "a",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                started++
                await g1.promise
            },
        })
        q.enqueue({
            id: "b",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                started++
                await g2.promise
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(started).toBe(1)
        expect(q.stats.active).toBe(1)
        expect(q.stats.queued).toBe(1)
        g1.resolve()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        expect(started).toBe(2)
        g2.resolve()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        let zero = createBitmapWorkQueue({ concurrency: 0, idle: false })
        let zStarted = 0
        let zg = gate()
        zero.enqueue({
            id: "z1",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                zStarted++
                await zg.promise
            },
        })
        zero.enqueue({
            id: "z2",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                zStarted++
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(zStarted).toBe(1)
        zg.resolve()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        expect(zStarted).toBe(2)
    })

    it("visible starts before queued preload when a slot frees", async () => {
        vi.stubGlobal("createImageBitmap", async () => fakeBitmap())
        let q = createBitmapWorkQueue({ concurrency: 1, idle: false })
        let order: string[] = []
        let g = gate()
        q.enqueue({
            id: "p1",
            pri: "preload",
            source: new Blob(),
            run: async () => {
                order.push("p1")
                await g.promise
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        q.enqueue({
            id: "p2",
            pri: "preload",
            source: new Blob(),
            run: async () => {
                order.push("p2")
            },
        })
        q.enqueue({
            id: "v",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                order.push("v")
            },
        })
        g.resolve()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        expect(order).toEqual(["p1", "v"])
        await Promise.resolve()
        await Promise.resolve()
        expect(order).toEqual(["p1", "v", "p2"])
    })

    it("enqueue false while running; queued same-id updates pri/source/run", async () => {
        vi.stubGlobal("createImageBitmap", async () => fakeBitmap())
        let q = createBitmapWorkQueue({ concurrency: 1, idle: false })
        let g = gate()
        let runs: string[] = []
        expect(
            q.enqueue({
                id: "a",
                pri: "preload",
                source: new Blob(),
                run: async () => {
                    runs.push("first")
                    await g.promise
                },
            }),
        ).toBe(true)
        await Promise.resolve()
        await Promise.resolve()
        expect(
            q.enqueue({
                id: "a",
                pri: "visible",
                source: new Blob(),
                run: async () => {
                    runs.push("replace-running")
                },
            }),
        ).toBe(false)
        q.enqueue({
            id: "b",
            pri: "preload",
            source: new Blob(),
            run: async () => {
                runs.push("b-old")
            },
        })
        q.enqueue({
            id: "b",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                runs.push("b-new")
            },
        })
        g.resolve()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        expect(runs).toEqual(["first", "b-new"])
    })

    it("idle true: preload waits for requestIdle; visible bypasses", async () => {
        vi.useFakeTimers()
        vi.stubGlobal("requestIdleCallback", undefined)
        vi.stubGlobal("createImageBitmap", async () => fakeBitmap())
        let q = createBitmapWorkQueue()
        let order: string[] = []
        q.enqueue({
            id: "p",
            pri: "preload",
            source: new Blob(),
            run: async () => {
                order.push("p")
            },
        })
        q.enqueue({
            id: "v",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                order.push("v")
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(order).toEqual(["v"])
        expect(q.stats.queued).toBe(1)
        expect(q.stats.active).toBe(0)
        await vi.advanceTimersByTimeAsync(0)
        await Promise.resolve()
        await Promise.resolve()
        expect(order).toEqual(["v", "p"])
    })

    it("idle fire while paused leaves preload queued until resume", async () => {
        vi.useFakeTimers()
        vi.stubGlobal("requestIdleCallback", undefined)
        vi.stubGlobal("createImageBitmap", async () => fakeBitmap())
        let q = createBitmapWorkQueue()
        let started = false
        q.pause()
        q.enqueue({
            id: "p",
            pri: "preload",
            source: new Blob(),
            run: async () => {
                started = true
            },
        })
        await vi.advanceTimersByTimeAsync(0)
        await Promise.resolve()
        await Promise.resolve()
        expect(started).toBe(false)
        expect(q.stats.queued).toBe(1)
        expect(q.stats.active).toBe(0)
        q.resume()
        await Promise.resolve()
        await Promise.resolve()
        expect(started).toBe(true)
    })

    it("closes bitmap when canceled during decode", async () => {
        let bmp = fakeBitmap()
        let release!: () => void
        vi.stubGlobal(
            "createImageBitmap",
            () =>
                new Promise<ImageBitmap>((resolve) => {
                    release = () => resolve(bmp)
                }),
        )
        let q = createBitmapWorkQueue({ idle: false })
        q.enqueue({ id: "a", pri: "visible", source: new Blob() })
        await Promise.resolve()
        expect(q.cancel("a")).toBe(true)
        release()
        await Promise.resolve()
        await Promise.resolve()
        expect(bmp.close).toHaveBeenCalledTimes(1)
    })

    it("pause blocks new starts including visible; resume pumps; cancel aborts running", async () => {
        vi.stubGlobal("createImageBitmap", async () => fakeBitmap())
        let q = createBitmapWorkQueue({ idle: false, concurrency: 1 })
        let aborted = false
        let g = gate()
        q.enqueue({
            id: "run",
            pri: "visible",
            source: new Blob(),
            run: async ({ signal }) => {
                signal.addEventListener("abort", () => {
                    aborted = true
                })
                await g.promise
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        q.pause()
        let started = false
        q.enqueue({
            id: "held",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                started = true
            },
        })
        g.resolve()
        await Promise.resolve()
        await Promise.resolve()
        expect(started).toBe(false)
        q.resume()
        await Promise.resolve()
        await Promise.resolve()
        expect(started).toBe(true)

        let g2 = gate()
        q.enqueue({
            id: "kill",
            pri: "visible",
            source: new Blob(),
            run: async ({ signal }) => {
                signal.addEventListener("abort", () => {
                    aborted = true
                })
                await g2.promise
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(q.cancel("kill")).toBe(true)
        expect(aborted).toBe(true)
        g2.resolve()
        await Promise.resolve()
        await Promise.resolve()
    })

    it("closes bitmap when run is omitted; leaves it open when run is provided", async () => {
        let owned = fakeBitmap()
        let handed = fakeBitmap()
        let n = 0
        vi.stubGlobal("createImageBitmap", async () => {
            n++
            return n === 1 ? owned : handed
        })
        let q = createBitmapWorkQueue({ idle: false })
        q.enqueue({ id: "warm", pri: "visible", source: new Blob() })
        await Promise.resolve()
        await Promise.resolve()
        expect(owned.close).toHaveBeenCalledTimes(1)
        let seen: ImageBitmap | undefined
        q.enqueue({
            id: "use",
            pri: "visible",
            source: new Blob(),
            run: async ({ bitmap }) => {
                seen = bitmap
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(seen).toBe(handed)
        expect(handed.close).not.toHaveBeenCalled()
    })

    it("passes abort signal into createImageBitmap", async () => {
        let seen: AbortSignal | undefined
        vi.stubGlobal("createImageBitmap", async (_src: unknown, opts?: { signal?: AbortSignal }) => {
            seen = opts?.signal
            return fakeBitmap()
        })
        let q = createBitmapWorkQueue({ idle: false })
        q.enqueue({ id: "a", pri: "visible", source: new Blob() })
        await Promise.resolve()
        await Promise.resolve()
        expect(seen).toBeInstanceOf(AbortSignal)
        expect(seen?.aborted).toBe(false)
    })

    it("decode throw calls onError and does not call run; AbortError is silent", async () => {
        let decodeErr = new Error("bad decode")
        vi.stubGlobal("createImageBitmap", async () => {
            throw decodeErr
        })
        let errors: Array<{ error: Error; id: string }> = []
        let ran = false
        let q = createBitmapWorkQueue({
            idle: false,
            onError: (error, id) => {
                errors.push({ error, id })
            },
        })
        q.enqueue({
            id: "boom",
            pri: "visible",
            source: new Blob(),
            run: async () => {
                ran = true
            },
        })
        await Promise.resolve()
        await Promise.resolve()
        expect(ran).toBe(false)
        expect(errors).toEqual([{ error: decodeErr, id: "boom" }])
        expect(q.stats.active).toBe(0)

        let abortErr = new Error("Aborted")
        abortErr.name = "AbortError"
        vi.stubGlobal("createImageBitmap", async () => {
            throw abortErr
        })
        errors.length = 0
        q.enqueue({ id: "aborted", pri: "visible", source: new Blob() })
        await Promise.resolve()
        await Promise.resolve()
        expect(errors).toEqual([])
    })

    it("cancel of a running decode frees the id for enqueue before createImageBitmap settles", async () => {
        let bmp1 = fakeBitmap()
        let bmp2 = fakeBitmap()
        let release!: (value: ImageBitmap) => void
        let calls = 0
        vi.stubGlobal("createImageBitmap", (_src: unknown, _opts?: { signal?: AbortSignal }) => {
            calls++
            if (calls === 1) {
                return new Promise<ImageBitmap>((resolve) => {
                    release = (value) => {
                        resolve(value)
                    }
                })
            }
            return Promise.resolve(bmp2)
        })
        let q = createBitmapWorkQueue({ idle: false })
        let secondRan = false
        expect(q.enqueue({ id: "same", pri: "visible", source: new Blob() })).toBe(true)
        await Promise.resolve()
        expect(q.stats.active).toBe(1)
        expect(q.cancel("same")).toBe(true)
        expect(q.stats.active).toBe(0)
        expect(
            q.enqueue({
                id: "same",
                pri: "visible",
                source: new Blob(),
                run: async () => {
                    secondRan = true
                },
            }),
        ).toBe(true)
        await Promise.resolve()
        await Promise.resolve()
        expect(secondRan).toBe(true)
        expect(q.stats.active).toBe(0)
        release(bmp1)
        await Promise.resolve()
        await Promise.resolve()
        expect(bmp1.close).toHaveBeenCalled()
        expect(q.stats.active).toBe(0)
    })
})
