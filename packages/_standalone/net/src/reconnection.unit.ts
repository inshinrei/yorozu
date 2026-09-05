import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultReconnectionStrategy, PersistentConnection } from "./reconnection"
import type { Closable } from "@yorozu/io"

class MockConnection implements Closable {
    close = vi.fn()
}

describe("PersistentConnection", () => {
    let pconn: PersistentConnection<string, MockConnection>
    let connectFn: any
    let onOpen: any
    let onClose: any
    let onWait: any
    let onError: any
    let mockConn: MockConnection

    beforeEach(() => {
        vi.useFakeTimers()

        mockConn = new MockConnection()
        connectFn = vi.fn()
        onOpen = vi.fn()
        onClose = vi.fn()
        onWait = vi.fn()
        onError = vi.fn().mockResolvedValue("reconnect")

        pconn = new PersistentConnection({
            connect: connectFn,
            onOpen,
            onClose,
            onWait,
            onError,
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("connects → calls onOpen → auto-closes (current design)", async () => {
        connectFn.mockResolvedValueOnce(mockConn)

        pconn.connect("wss://example.com")

        expect(pconn.isConnecting).toBe(true)
        await vi.runAllTimersAsync()

        expect(onOpen).toHaveBeenCalledWith(mockConn)
        expect(mockConn.close).toHaveBeenCalled()
        expect(pconn.isConnected).toBe(false)
        expect(pconn.isWaiting).toBe(false)
    })

    it("retries with default backoff on connect failure", async () => {
        connectFn.mockRejectedValueOnce(new Error("fail1")).mockResolvedValueOnce(mockConn)

        pconn.connect("wss://example.com")

        await vi.runAllTimersAsync()
        expect(onError).toHaveBeenCalled()
        expect(onWait).toHaveBeenCalledWith(expect.any(Number))

        await vi.advanceTimersByTimeAsync(1000)

        expect(connectFn).toHaveBeenCalledTimes(2)
        expect(onOpen).toHaveBeenCalled()
    })

    it("stops retrying when onError returns 'close'", async () => {
        onError.mockResolvedValueOnce("close")
        connectFn.mockRejectedValueOnce(new Error("fatal"))

        pconn.connect("wss://example.com")
        await vi.runAllTimersAsync()

        expect(connectFn).toHaveBeenCalledTimes(1)
        expect(pconn.isWaiting).toBe(false)
    })

    it.todo("close() during backoff cancels sleep", async () => {
        connectFn.mockRejectedValue(new Error("fail"))
        pconn.connect("wss://example.com")

        await vi.runAllTimersAsync()
        expect(pconn.isWaiting).toBe(true)

        let closePromise = pconn.close()
        await vi.runAllTimersAsync()

        await closePromise
        expect(pconn.isWaiting).toBe(false)
    })

    it("reconnect(force) closes active connection", async () => {
        connectFn.mockResolvedValueOnce(mockConn)
        pconn.connect("wss://example.com")
        await vi.runAllTimersAsync()

        pconn.reconnect(true)
        expect(mockConn.close).toHaveBeenCalled()
    })

    it("changeTransport switches connect fn after shutdown", async () => {
        let newConnect = vi.fn().mockResolvedValue(new MockConnection())

        pconn.connect("wss://old")
        await pconn.close()

        await pconn.changeTransport(newConnect)
        pconn.connect("wss://new")

        expect(newConnect).toHaveBeenCalledWith("wss://new")
    })

    it("prevents connecting to different address while active", () => {
        pconn.connect("wss://one.com")
        expect(() => pconn.connect("wss://two.com")).toThrow("already open to another address")
    })

    it("reports accurate state getters", async () => {
        expect(pconn.isConnected).toBe(false)
        expect(pconn.isConnecting).toBe(false)
        expect(pconn.isWaiting).toBe(false)

        connectFn.mockReturnValueOnce(new Promise(() => {}))
        pconn.connect("test")
        expect(pconn.isConnecting).toBe(true)
    })

    describe("defaults", () => {
        it("defaultReconnectionStrategy follows backoff curve", () => {
            let state = { previousWait: null, consequentFails: 0, lastError: null } as any
            expect(defaultReconnectionStrategy(state)).toBe(0)

            state.previousWait = 0
            expect(defaultReconnectionStrategy(state)).toBe(1000)

            state.previousWait = 2500
            expect(defaultReconnectionStrategy(state)).toBe(3500)

            state.previousWait = 5000
            expect(defaultReconnectionStrategy(state)).toBe(5000)
        })
    })
})
