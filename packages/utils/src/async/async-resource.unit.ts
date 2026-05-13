import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AsyncResource } from "./async-resource"
import * as timers from "./timers"

vi.mock("./timers")

describe("AsyncResource", () => {
    let fetcherMock: any
    let onErrorMock: any

    const NOW = 1000

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.spyOn(performance, "now").mockReturnValue(NOW)

        fetcherMock = vi.fn()
        onErrorMock = vi.fn()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("initializes with null data and stale state", () => {
        let resource = new AsyncResource({ fetcher: fetcherMock })
        expect(resource.getCached()).toBeNull()
        expect(resource.isStale).toBe(true)
    })

    it("setData updates context, emits event, and schedules auto-reload timer when enabled", () => {
        let resource = new AsyncResource({
            fetcher: fetcherMock,
            autoReload: true,
            authReloadAfter: 2000,
        })

        let emitSpy = vi.spyOn(resource.onUpdated, "emit")

        resource.setData("test-data", 5000)

        expect(resource.getCached()).toBe("test-data")
        expect(resource.isStale).toBe(false)
        expect(emitSpy).toHaveBeenCalledOnce()

        let ctx = emitSpy.mock.calls[0][0]
        expect(ctx.current).toBe("test-data")
        expect(ctx.currentExpiresAt).toBe(NOW + 5000)
        expect(vi.spyOn(timers, "setTimeout")).toHaveBeenCalledWith(expect.any(Function), 7000)
    })

    it("update skips when not stale and not forced", async () => {
        let resource = new AsyncResource({ fetcher: fetcherMock })
        resource.setData("cached", 100000)
        fetcherMock.mockResolvedValue({ data: "new", expiresIn: 10000 })

        await resource.update()

        expect(fetcherMock).not.toHaveBeenCalled()
        expect(resource.getCached()).toBe("cached")
    })

    it("passes correct context to fetcher", async () => {
        fetcherMock.mockResolvedValue({ data: "ctx-test", expiresIn: 1000 })
        let resource = new AsyncResource({ fetcher: fetcherMock })

        await resource.update()

        let ctx = fetcherMock.mock.calls[0][0]
        expect(ctx.current).toBe("ctx-test")
        expect(ctx.isBackground).toBe(false)
    })

    it("deduplicates concurrent update calls", async () => {
        fetcherMock.mockResolvedValue({ data: "deduped", expiresIn: 10000 })
        let resource = new AsyncResource({ fetcher: fetcherMock })

        let p1 = resource.update()
        let p2 = resource.update()

        await Promise.all([p1, p2])

        expect(fetcherMock).toHaveBeenCalledTimes(1)
    })

    it("handles fetcher errors via onError", async () => {
        let resource = new AsyncResource({ fetcher: fetcherMock, onError: onErrorMock })
        let error = new Error("network fail")
        fetcherMock.mockRejectedValue(error)

        await resource.update()

        expect(onErrorMock).toHaveBeenCalledWith(error, expect.any(Object))
        expect(resource.getCached()).toBeNull()
    })

    it("SWR mode returns cached data immediately and triggers background update", async () => {
        let resource = new AsyncResource({
            fetcher: fetcherMock,
            swr: true,
            swrValidator: () => true,
        })

        resource.setData("swr-cached", 100000)
        fetcherMock.mockResolvedValue({ data: "background", expiresIn: 5000 })

        let data = await resource.get()

        expect(data).toBe("swr-cached")
        expect(fetcherMock).toHaveBeenCalledOnce()
        expect(resource.getCached()).toBe("background")
    })

    it("destroy clears timer, aborts pending request, and clears listeners", () => {
        let resource = new AsyncResource({
            fetcher: fetcherMock,
            autoReload: true,
        })

        let clearSpy = vi.spyOn(resource.onUpdated, "clear")

        resource.setData("data", 10000)
        resource.destroy()

        expect(clearSpy).toHaveBeenCalledOnce()
    })
})
