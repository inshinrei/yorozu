import { beforeEach, describe, expect, it, vi } from "vitest"
import {
    connectWs,
    connectWsFramed,
    WebSocketConnection,
    WebSocketConnectionClosedError,
    WebSocketConnectionFramedBase,
    type WebSocketEndpoint,
} from "./websocket"

let MockWebSocket: any
let lastCreatedSocket: any

beforeEach(() => {
    lastCreatedSocket = null

    MockWebSocket = class {
        binaryType = "arraybuffer"
        readyState: 0 | 1 | 3 = WebSocket.CONNECTING
        url: string
        send = vi.fn()
        close = vi.fn()
        private listeners = new Map<string, Function[]>()

        constructor(url: string | URL, protocols?: string | string[]) {
            lastCreatedSocket = this
            this.url = url.toString()
        }

        addEventListener(type: string, listener: Function) {
            if (!this.listeners.has(type)) this.listeners.set(type, [])
            this.listeners.get(type)!.push(listener)
        }

        removeEventListener(type: string, listener: Function) {
            const list = this.listeners.get(type)
            if (list)
                this.listeners.set(
                    type,
                    list.filter((l) => l !== listener),
                )
        }

        dispatch(type: string, event: any) {
            this.listeners.get(type)?.forEach((l) => l(event))
        }

        simulateOpen() {
            this.readyState = WebSocket.OPEN
            this.dispatch("open", new Event("open"))
        }

        simulateMessage(data: string | ArrayBufferLike) {
            this.dispatch("message", new MessageEvent("message", { data }))
        }

        simulateClose(code = 1000, reason = "") {
            this.readyState = WebSocket.CLOSED
            const ev = new Event("close") as any
            ev.code = code
            ev.reason = reason
            this.dispatch("close", ev)
        }

        simulateError(err?: Error) {
            const ev = new Event("error") as any
            if (err) ev.error = err
            this.dispatch("error", ev)
        }
    }
})

describe("WebSocketConnection (streaming)", () => {
    let socket: any
    let conn: WebSocketConnection

    beforeEach(() => {
        socket = new MockWebSocket("ws://test.local")
        conn = new WebSocketConnection(socket)
        socket.simulateOpen()
    })

    it("writes bytes directly", async () => {
        let data = new Uint8Array([1, 2, 3])
        await conn.write(data)
        expect(socket.send).toHaveBeenCalledWith(data)
    })

    it("buffers text + binary into single stream", async () => {
        socket.simulateMessage("hello")
        socket.simulateMessage(new Uint8Array([10, 20, 30]).buffer)

        let buf = new Uint8Array(20)
        let n = await conn.read(buf)
        expect(n).toBe(8)
        expect(buf.subarray(0, 8)).toEqual(new Uint8Array([104, 101, 108, 108, 111, 10, 20, 30]))
    })

    it("returns immediately when data is already buffered", async () => {
        socket.simulateMessage("fast")
        let buf = new Uint8Array(10)
        let n = await conn.read(buf)
        expect(n).toBe(4)
    })

    it("throws on read after error/close", async () => {
        let boom = new Error("boom")
        socket.simulateError(boom)
        await expect(conn.read(new Uint8Array(5))).rejects.toThrow(boom)
    })

    it("close() and closeWithCode() notify waiters", () => {
        conn.closeWithCode(1006, "abnormal")
        expect(socket.close).toHaveBeenCalledWith(1006, "abnormal")
    })
})

describe("WebSocketConnectionFramedBase", () => {
    let socket: any
    let conn: WebSocketConnectionFramedBase

    beforeEach(() => {
        socket = new MockWebSocket("ws://test.local")
        conn = new WebSocketConnectionFramedBase(socket)
        socket.simulateOpen()
    })

    it("readFrame / writeFrame preserve message boundaries", async () => {
        socket.simulateMessage("frame1")
        socket.simulateMessage(new Uint8Array([9, 9, 9]).buffer)

        expect(await conn.readFrame()).toBe("frame1")
        expect(await conn.readFrame()).toEqual(new Uint8Array([9, 9, 9]))
    })

    it("writeFrame forwards any payload", async () => {
        let spy = vi.spyOn(socket, "send")
        await conn.writeFrame("string-frame")
        await conn.writeFrame(new Uint8Array([42]))
        expect(spy).toHaveBeenCalledTimes(2)
    })
})

describe("connectWs / connectWsFramed", () => {
    let endpoint: WebSocketEndpoint

    beforeEach(() => {
        endpoint = {
            url: "ws://test.local",
            implementation: MockWebSocket as any,
        }
    })

    it("connectWs resolves on open", async () => {
        let promise = connectWs(endpoint)
        lastCreatedSocket.simulateOpen()
        let conn = await promise
        expect(conn).toBeInstanceOf(WebSocketConnection)
    })

    it("connectWs rejects on error before open", async () => {
        let promise = connectWs(endpoint)
        let boom = new Error("handshake failed")
        lastCreatedSocket.simulateError(boom)
        await expect(promise).rejects.toThrow("handshake failed")
    })

    it("connectWsFramed works identically", async () => {
        let promise = connectWsFramed(endpoint)
        lastCreatedSocket.simulateOpen()
        let conn = await promise
        expect(conn).toBeInstanceOf(WebSocketConnectionFramedBase)
    })
})

describe("WebSocketConnectionClosedError", () => {
    it("wraps code + reason", () => {
        let err = new WebSocketConnectionClosedError(1006, "abnormal")
        expect(err.code).toBe(1006)
        expect(err.reason).toBe("abnormal")
        expect(err.message).toContain("1006")
        expect(err.message).toContain("abnormal")
    })
})
