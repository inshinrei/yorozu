import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AsyncInterval } from "./async-interval"
import * as timers from "./timers"

vi.mock("./timers")

describe("AsyncInterval", () => {
    let interval: AsyncInterval
    let handlerMock: any
    let onErrorMock: any
    let setTimeoutSpy: any
    let clearTimeoutSpy: any

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()

        handlerMock = vi.fn().mockResolvedValue(undefined)
        onErrorMock = vi.fn()

        setTimeoutSpy = vi.spyOn(timers, "setTimeout")
        clearTimeoutSpy = vi.spyOn(timers, "clearTimeout")

        interval = new AsyncInterval(handlerMock, 1000)
        interval.onError(onErrorMock)
    })

    afterEach(() => {
        vi.useRealTimers()
        interval.stop()
    })

    it("start() schedules first timeout after given delay", () => {
        interval.start(500)
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500)
    })

    it("start() defaults to interval delay", () => {
        interval.start()
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    it("startNow() executes handler immediately and reschedules", async () => {
        interval.startNow()

        expect(handlerMock).toHaveBeenCalledOnce()
        expect(handlerMock.mock.calls[0][0]).toBeInstanceOf(AbortSignal)

        await vi.advanceTimersByTimeAsync(0)
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    it("does NOT reschedule if stopped inside handler", async () => {
        handlerMock.mockImplementationOnce(async (signal: AbortSignal) => {
            interval.stop()
            await new Promise((r) => setTimeout(r, 10))
        })

        interval.startNow()
        await vi.advanceTimersByTimeAsync(20)

        expect(handlerMock).toHaveBeenCalledOnce()
    })

    it("calls onError when handler throws", async () => {
        let boom = new Error("handler boom")
        handlerMock.mockRejectedValueOnce(boom)

        interval.startNow()
        await vi.advanceTimersByTimeAsync(0)

        expect(onErrorMock).toHaveBeenCalledWith(boom)
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    it("start() mid-flight does not start a second overlapping loop", async () => {
        handlerMock.mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 50))
        })

        interval.startNow()
        expect(handlerMock).toHaveBeenCalledTimes(1)

        interval.start()
        expect(setTimeoutSpy).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(50)

        expect(setTimeoutSpy).toHaveBeenCalledTimes(1)
        expect(handlerMock).toHaveBeenCalledTimes(1)
    })

    it("stop() while handler is running aborts its signal", async () => {
        let abortSeen = false
        handlerMock.mockImplementationOnce(async (signal: AbortSignal) => {
            interval.stop()
            await new Promise((r) => setTimeout(r, 50))
            abortSeen = signal.aborted
        })

        interval.startNow()
        await vi.advanceTimersByTimeAsync(100)

        expect(abortSeen).toBe(true)
    })
})
