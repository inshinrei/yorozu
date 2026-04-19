import { beforeEach, describe, expect, it, MockedFunction, vi } from "vitest"
import { AggregateError, asyncPool, parallelMap } from "./pool"
import { NoneToVoidFunction } from "../types"

describe("asyncPool", () => {
    let executor: MockedFunction<NoneToVoidFunction>

    beforeEach(() => {
        executor = vi.fn()
    })

    it("processes all items with default limit=16", async () => {
        const items = Array.from({ length: 50 }, (_, i) => i)
        await asyncPool(items, executor)
        expect(executor).toHaveBeenCalledTimes(50)
    })

    it("respects custom concurrency limit", async () => {
        const items = Array.from({ length: 30 }, (_, i) => i)
        let running = 0
        let maxRunning = 0

        executor.mockImplementation(async () => {
            running++
            maxRunning = Math.max(maxRunning, running)
            await new Promise((r) => setTimeout(r, 8))
            running--
        })

        await asyncPool(items, executor, { limit: 4 })
        expect(maxRunning).toBe(4)
    })

    it("awaits onErrorStrategy when it returns a Promise", async () => {
        let strategyCalled = 0
        executor.mockImplementationOnce(async () => {
            throw new Error("boom")
        })

        await asyncPool([1], executor, {
            onErrorStrategy: async (): Promise<"ignore"> => {
                strategyCalled++
                await new Promise((r) => setTimeout(r, 5))
                return "ignore"
            },
        })

        expect(strategyCalled).toBe(1)
    })

    it('onErrorStrategy = "collect" throws AggregateError with all errors', async () => {
        executor = vi
            .fn()
            .mockImplementationOnce(async () => {
                throw new Error("e1")
            })
            .mockImplementationOnce(async () => {
                throw new Error("e2")
            })
            .mockImplementation(async () => {})

        let caught: AggregateError<number> | undefined

        try {
            await asyncPool([1, 2, 3], executor, { onErrorStrategy: () => "collect" })
        } catch (e) {
            caught = e as AggregateError<number>
        }

        expect(caught).toBeDefined()
        expect(caught).toBeInstanceOf(AggregateError)
        expect(caught!.errors).toHaveLength(2)
        expect(caught!.errors[0].item).toBe(1)
        expect(caught!.errors[0].error).toBeInstanceOf(Error)
        expect(caught!.errors[1].item).toBe(2)
    })

    it("respects AbortSignal", async () => {
        const controller = new AbortController()
        const items = Array.from({ length: 100 }, (_, i) => i)

        executor.mockImplementation(async () => new Promise((r) => setTimeout(r, 20)))

        setTimeout(() => controller.abort(), 30)

        expect(asyncPool(items, executor, { signal: controller.signal })).rejects.toThrow()
    })
})

describe("parallelMap", () => {
    it("preserves order and works with async iterable", async () => {
        async function* gen() {
            yield 5
            await new Promise((r) => setTimeout(r, 10))
            yield 3
            yield 7
        }

        const result = await parallelMap(gen(), async (n) => n * 10, { limit: 2 })
        expect(result).toEqual([50, 30, 70])
    })
})
