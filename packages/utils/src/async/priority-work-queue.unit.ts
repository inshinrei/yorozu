import { describe, expect, it } from "vitest"

import { createPriorityWorkQueue } from "./priority-work-queue"

type Gate = {
    promise: Promise<void>
    resolve: () => void
}

function gate(): Gate {
    let resolve!: () => void
    let promise = new Promise<void>((res) => {
        resolve = () => res()
    })
    return { promise, resolve }
}

async function tick(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

describe("createPriorityWorkQueue", () => {
    it("limits concurrency and starts next on release; maxActive is high-water", async () => {
        let started: string[] = []
        let gates = new Map<string, Gate>()
        let q = createPriorityWorkQueue({ concurrency: 2 })

        let runFor = (id: string) => async () => {
            started.push(id)
            let g = gate()
            gates.set(id, g)
            await g.promise
        }

        expect(q.enqueue({ id: "a", pri: "preload", run: runFor("a") })).toBe(true)
        expect(q.enqueue({ id: "b", pri: "preload", run: runFor("b") })).toBe(true)
        expect(q.enqueue({ id: "c", pri: "preload", run: runFor("c") })).toBe(true)

        await tick()
        expect(started).toEqual(["a", "b"])
        expect(q.stats.active).toBe(2)
        expect(q.stats.queued).toBe(1)
        expect(q.stats.maxActive).toBe(2)

        gates.get("a")!.resolve()
        await tick()
        expect(started).toEqual(["a", "b", "c"])
        expect(q.stats.maxActive).toBe(2)

        gates.get("b")!.resolve()
        gates.get("c")!.resolve()
        await tick()
        expect(q.stats.active).toBe(0)
        expect(q.stats.queued).toBe(0)
    })

    it("visible preempts queued preload after a slot frees", async () => {
        let started: string[] = []
        let gates = new Map<string, Gate>()
        let q = createPriorityWorkQueue({ concurrency: 2 })

        let runFor = (id: string) => async () => {
            started.push(id)
            let g = gate()
            gates.set(id, g)
            await g.promise
        }

        q.enqueue({ id: "p1", pri: "preload", run: runFor("p1") })
        q.enqueue({ id: "p2", pri: "preload", run: runFor("p2") })
        await tick()
        expect(started).toEqual(["p1", "p2"])

        q.enqueue({ id: "p3", pri: "preload", run: runFor("p3") })
        q.enqueue({ id: "v", pri: "visible", run: runFor("v") })

        gates.get("p1")!.resolve()
        await tick()
        expect(started).toEqual(["p1", "p2", "v"])
        expect(started).not.toContain("p3")

        gates.get("p2")!.resolve()
        gates.get("v")!.resolve()
        await tick()
        expect(started).toContain("p3")
        gates.get("p3")!.resolve()
        await tick()
    })

    it("cancel queued id never runs and returns true", async () => {
        let started: string[] = []
        let g = gate()
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "hold",
            pri: "preload",
            run: async () => {
                started.push("hold")
                await g.promise
            },
        })
        q.enqueue({
            id: "queued",
            pri: "preload",
            run: async () => {
                started.push("queued")
            },
        })
        await tick()
        expect(started).toEqual(["hold"])

        expect(q.cancel("queued")).toBe(true)
        expect(q.cancel("missing")).toBe(false)
        expect(q.stats.queued).toBe(0)

        g.resolve()
        await tick()
        expect(started).toEqual(["hold"])
        expect(q.isBusy("queued")).toBe(false)
    })

    it("cancel running id aborts signal and clears busy after settle", async () => {
        let seenAborted = false
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "run",
            pri: "visible",
            run: async ({ signal }) => {
                expect(signal.aborted).toBe(false)
                let wait = gate()
                signal.addEventListener("abort", () => {
                    seenAborted = true
                    wait.resolve()
                })
                await wait.promise
                if (signal.aborted) {
                    let err = new Error("Aborted")
                    err.name = "AbortError"
                    throw err
                }
            },
        })
        await tick()
        expect(q.isBusy("run")).toBe(true)

        expect(q.cancel("run")).toBe(true)
        expect(seenAborted).toBe(true)
        expect(q.isBusy("run")).toBe(true)

        await tick()
        expect(q.isBusy("run")).toBe(false)
        expect(q.stats.active).toBe(0)
    })

    it("re-enqueue same id while running does not replace run", async () => {
        let runs: string[] = []
        let g = gate()
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "x",
            pri: "preload",
            run: async () => {
                runs.push("first")
                await g.promise
            },
        })
        await tick()
        expect(runs).toEqual(["first"])
        expect(q.isBusy("x")).toBe(true)

        expect(
            q.enqueue({
                id: "x",
                pri: "visible",
                run: async () => {
                    runs.push("second")
                },
            }),
        ).toBe(false)
        expect(q.stats.queued).toBe(0)

        g.resolve()
        await tick()
        expect(runs).toEqual(["first"])
        expect(q.isBusy("x")).toBe(false)
    })

    it("re-enqueue queued id upgrades pri and run onto the new lane tail", async () => {
        let started: string[] = []
        let hold = gate()
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "hold",
            pri: "visible",
            run: async () => {
                started.push("hold")
                await hold.promise
            },
        })
        await tick()

        q.enqueue({
            id: "a",
            pri: "preload",
            run: async () => {
                started.push("a-preload")
            },
        })
        q.enqueue({
            id: "b",
            pri: "preload",
            run: async () => {
                started.push("b")
            },
        })
        expect(
            q.enqueue({
                id: "a",
                pri: "visible",
                run: async () => {
                    started.push("a-visible")
                },
            }),
        ).toBe(true)
        expect(q.stats.queued).toBe(2)

        hold.resolve()
        await tick()
        expect(started).toEqual(["hold", "a-visible", "b"])
    })

    it("floors concurrency at 1 and defaults to 3", async () => {
        let started = 0
        let gates: Gate[] = []
        let q = createPriorityWorkQueue({ concurrency: 0 })

        for (let i = 0; i < 2; i++) {
            let id = String(i)
            q.enqueue({
                id,
                pri: "background",
                run: async () => {
                    started++
                    let g = gate()
                    gates.push(g)
                    await g.promise
                },
            })
        }
        await tick()
        expect(started).toBe(1)
        expect(q.stats.maxActive).toBe(1)

        gates[0]!.resolve()
        await tick()
        expect(started).toBe(2)
        gates[1]!.resolve()
        await tick()

        let defQ = createPriorityWorkQueue()
        let defStarted = 0
        let defGates: Gate[] = []
        for (let i = 0; i < 4; i++) {
            defQ.enqueue({
                id: `d${i}`,
                pri: "preload",
                run: async () => {
                    defStarted++
                    let g = gate()
                    defGates.push(g)
                    await g.promise
                },
            })
        }
        await tick()
        expect(defStarted).toBe(3)
        expect(defQ.stats.maxActive).toBe(3)
        for (let g of defGates) g.resolve()
        await tick()
    })

    it("cancelAll drops queued and aborts running", async () => {
        let started: string[] = []
        let aborted = false
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "run",
            pri: "preload",
            run: async ({ signal }) => {
                started.push("run")
                let wait = gate()
                signal.addEventListener("abort", () => {
                    aborted = true
                    wait.resolve()
                })
                await wait.promise
            },
        })
        q.enqueue({
            id: "queued",
            pri: "preload",
            run: async () => {
                started.push("queued")
            },
        })
        await tick()
        expect(started).toEqual(["run"])

        q.cancelAll()
        expect(aborted).toBe(true)
        expect(q.stats.queued).toBe(0)
        await tick()
        expect(started).toEqual(["run"])
        expect(q.stats.active).toBe(0)
        expect(q.isBusy("run")).toBe(false)
        expect(q.isBusy("queued")).toBe(false)
    })

    it("onError receives non-abort failures and skips AbortError", async () => {
        let seen: Array<{ id: string; name: string }> = []
        let q = createPriorityWorkQueue({
            concurrency: 1,
            onError: (error, id) => {
                seen.push({ id, name: error.name })
            },
        })

        q.enqueue({
            id: "boom",
            pri: "background",
            run: async () => {
                throw new Error("nope")
            },
        })
        await tick()
        expect(seen).toEqual([{ id: "boom", name: "Error" }])

        q.enqueue({
            id: "abort-me",
            pri: "background",
            run: async ({ signal }) => {
                let done = gate()
                signal.addEventListener("abort", () => done.resolve())
                await done.promise
                let err = new Error("Aborted")
                err.name = "AbortError"
                throw err
            },
        })
        await tick()
        q.cancel("abort-me")
        await tick()
        expect(seen).toEqual([{ id: "boom", name: "Error" }])
    })

    it("onError wraps non-Error throws via unknownToError", async () => {
        let seen: Error[] = []
        let q = createPriorityWorkQueue({
            onError: (error) => {
                seen.push(error)
            },
        })
        q.enqueue({
            id: "str",
            pri: "preload",
            run: async () => {
                throw "bad"
            },
        })
        await tick()
        expect(seen).toHaveLength(1)
        expect(seen[0]).toBeInstanceOf(Error)
        expect(seen[0]!.message).toBe("bad")
    })

    it("onError can re-enqueue the same id after the slot is freed", async () => {
        let runs: string[] = []
        let q = createPriorityWorkQueue({
            concurrency: 1,
            onError: (_error, id) => {
                expect(q.isBusy(id)).toBe(false)
                expect(
                    q.enqueue({
                        id,
                        pri: "background",
                        run: async () => {
                            runs.push("retry")
                        },
                    }),
                ).toBe(true)
            },
        })

        expect(
            q.enqueue({
                id: "job",
                pri: "background",
                run: async () => {
                    runs.push("first")
                    throw new Error("fail")
                },
            }),
        ).toBe(true)

        await tick()
        expect(runs).toEqual(["first", "retry"])
        expect(q.stats.active).toBe(0)
        expect(q.isBusy("job")).toBe(false)
    })

    it("onError throw does not reject the worker", async () => {
        let q = createPriorityWorkQueue({
            concurrency: 1,
            onError: () => {
                throw new Error("handler boom")
            },
        })
        q.enqueue({
            id: "boom",
            pri: "background",
            run: async () => {
                throw new Error("job boom")
            },
        })
        await tick()
        expect(q.stats.active).toBe(0)
        expect(q.isBusy("boom")).toBe(false)
    })

    it("same-lane re-enqueue moves the job to that lane's tail", async () => {
        let started: string[] = []
        let hold = gate()
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "hold",
            pri: "visible",
            run: async () => {
                started.push("hold")
                await hold.promise
            },
        })
        await tick()

        q.enqueue({
            id: "a",
            pri: "preload",
            run: async () => {
                started.push("a-first")
            },
        })
        q.enqueue({
            id: "b",
            pri: "preload",
            run: async () => {
                started.push("b")
            },
        })
        expect(
            q.enqueue({
                id: "a",
                pri: "preload",
                run: async () => {
                    started.push("a-tail")
                },
            }),
        ).toBe(true)

        hold.resolve()
        await tick()
        expect(started).toEqual(["hold", "b", "a-tail"])
    })

    it("preload starts before queued background after a slot frees", async () => {
        let started: string[] = []
        let hold = gate()
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "hold",
            pri: "visible",
            run: async () => {
                started.push("hold")
                await hold.promise
            },
        })
        await tick()
        q.enqueue({
            id: "bg",
            pri: "background",
            run: async () => {
                started.push("bg")
            },
        })
        q.enqueue({
            id: "p",
            pri: "preload",
            run: async () => {
                started.push("p")
            },
        })
        hold.resolve()
        await tick()
        expect(started).toEqual(["hold", "p", "bg"])
    })

    it("throw with no onError does not reject the worker", async () => {
        let q = createPriorityWorkQueue({ concurrency: 1 })
        q.enqueue({
            id: "boom",
            pri: "background",
            run: async () => {
                throw new Error("job boom")
            },
        })
        await tick()
        expect(q.stats.active).toBe(0)
        expect(q.isBusy("boom")).toBe(false)
    })

    it("cancelAll with concurrency 2 aborts every runner and drops queued", async () => {
        let started: string[] = []
        let aborted: string[] = []
        let q = createPriorityWorkQueue({ concurrency: 2 })

        let runFor =
            (id: string) =>
            async ({ signal }: { signal: AbortSignal }) => {
                started.push(id)
                let wait = gate()
                signal.addEventListener("abort", () => {
                    aborted.push(id)
                    wait.resolve()
                })
                await wait.promise
            }

        q.enqueue({ id: "a", pri: "preload", run: runFor("a") })
        q.enqueue({ id: "b", pri: "preload", run: runFor("b") })
        q.enqueue({
            id: "c",
            pri: "preload",
            run: async () => {
                started.push("c")
            },
        })
        await tick()
        expect(started).toEqual(["a", "b"])

        q.cancelAll()
        expect(aborted.sort()).toEqual(["a", "b"])
        expect(q.stats.queued).toBe(0)
        await tick()
        expect(started).toEqual(["a", "b"])
        expect(q.stats.active).toBe(0)
        expect(q.isBusy("c")).toBe(false)
    })

    it("enqueue of a cancelled running id is ignored until settle", async () => {
        let runs: string[] = []
        let wait = gate()
        let q = createPriorityWorkQueue({ concurrency: 1 })

        q.enqueue({
            id: "x",
            pri: "preload",
            run: async ({ signal }) => {
                runs.push("first")
                let done = gate()
                signal.addEventListener("abort", () => done.resolve())
                await wait.promise
                await done.promise
            },
        })
        await tick()
        expect(q.cancel("x")).toBe(true)
        expect(q.isBusy("x")).toBe(true)
        expect(
            q.enqueue({
                id: "x",
                pri: "visible",
                run: async () => {
                    runs.push("second")
                },
            }),
        ).toBe(false)

        wait.resolve()
        await tick()
        expect(q.isBusy("x")).toBe(false)
        expect(runs).toEqual(["first"])
        expect(
            q.enqueue({
                id: "x",
                pri: "visible",
                run: async () => {
                    runs.push("after")
                },
            }),
        ).toBe(true)
        await tick()
        expect(runs).toEqual(["first", "after"])
    })

    it("non-finite and fractional concurrency floor to 1; omit still defaults to 3", async () => {
        let startedNan = 0
        let nanGates: Array<ReturnType<typeof gate>> = []
        let nanQ = createPriorityWorkQueue({ concurrency: Number.NaN })
        for (let i = 0; i < 2; i++) {
            nanQ.enqueue({
                id: `n${i}`,
                pri: "preload",
                run: async () => {
                    startedNan++
                    let g = gate()
                    nanGates.push(g)
                    await g.promise
                },
            })
        }
        await tick()
        expect(startedNan).toBe(1)
        expect(nanQ.stats.maxActive).toBe(1)
        nanGates[0]!.resolve()
        await tick()
        nanGates[1]!.resolve()
        await tick()

        let startedFrac = 0
        let fracGates: Array<ReturnType<typeof gate>> = []
        let fracQ = createPriorityWorkQueue({ concurrency: 1.9 })
        for (let i = 0; i < 3; i++) {
            fracQ.enqueue({
                id: `f${i}`,
                pri: "preload",
                run: async () => {
                    startedFrac++
                    let g = gate()
                    fracGates.push(g)
                    await g.promise
                },
            })
        }
        await tick()
        expect(startedFrac).toBe(1)
        expect(fracQ.stats.maxActive).toBe(1)
        for (let g of fracGates) g.resolve()
        await tick()

        let infQ = createPriorityWorkQueue({ concurrency: Number.POSITIVE_INFINITY })
        let infStarted = 0
        let infGates: Array<ReturnType<typeof gate>> = []
        for (let i = 0; i < 2; i++) {
            infQ.enqueue({
                id: `i${i}`,
                pri: "preload",
                run: async () => {
                    infStarted++
                    let g = gate()
                    infGates.push(g)
                    await g.promise
                },
            })
        }
        await tick()
        expect(infStarted).toBe(1)
        expect(infQ.stats.maxActive).toBe(1)
        infGates[0]!.resolve()
        await tick()
        expect(infStarted).toBe(2)
        infGates[1]!.resolve()
        await tick()
    })
})
