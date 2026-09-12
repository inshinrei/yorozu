import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { flushDomSchedule, queueMeasure, queueMeasureAfterMutate, queueMutate } from "./dom-schedule"

function stubRaf(): void {
    // delay 1ms so advanceTimersByTimeAsync(1) drains one frame only;
    // setTimeout(0) nests would both flush under a single advance(1)
    vi.stubGlobal(
        "requestAnimationFrame",
        (cb: FrameRequestCallback) => setTimeout(() => cb(0), 1) as unknown as number,
    )
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
}

describe("dom schedule", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        stubRaf()
    })
    afterEach(() => {
        flushDomSchedule()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("runs all measures then all mutates on one rAF", async () => {
        let order: string[] = []
        queueMeasure(() => order.push("r1"))
        queueMutate(() => order.push("w1"))
        queueMeasure(() => order.push("r2"))
        queueMutate(() => order.push("w2"))
        expect(order).toEqual([])
        await vi.advanceTimersByTimeAsync(1)
        expect(order).toEqual(["r1", "r2", "w1", "w2"])
    })

    it("runs nested queueMutate from a measure in the same tick", async () => {
        let order: string[] = []
        queueMeasure(() => {
            order.push("r")
            queueMutate(() => order.push("w-nested"))
        })
        queueMutate(() => order.push("w"))
        await vi.advanceTimersByTimeAsync(1)
        expect(order).toEqual(["r", "w", "w-nested"])
    })

    it("defers nested queueMeasure from a mutate to the next tick", async () => {
        let order: string[] = []
        queueMutate(() => {
            order.push("w")
            queueMeasure(() => order.push("r-next"))
        })
        await vi.advanceTimersByTimeAsync(1)
        expect(order).toEqual(["w"])
        await vi.advanceTimersByTimeAsync(1)
        expect(order).toEqual(["w", "r-next"])
    })

    it("queueMeasureAfterMutate runs after mutates and can return a follow-up write", async () => {
        let order: string[] = []
        queueMeasure(() => order.push("r"))
        queueMutate(() => order.push("w"))
        queueMeasureAfterMutate(() => {
            order.push("r2")
            return () => order.push("w2")
        })
        await vi.advanceTimersByTimeAsync(1)
        expect(order).toEqual(["r", "w", "r2", "w2"])
    })

    it("flushDomSchedule drains without waiting for rAF", () => {
        let order: string[] = []
        queueMeasure(() => order.push("r"))
        queueMutate(() => order.push("w"))
        flushDomSchedule()
        expect(order).toEqual(["r", "w"])
        flushDomSchedule()
        expect(order).toEqual(["r", "w"])
    })
})
