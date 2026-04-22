import { ConnectionClosedError } from "./errors"
import { Bytes, Closable } from "@yorozu/io"
import { ConditionVariable, Deque, utf8 } from "@yorozu/utils"
import { ConnectFunction, Connection } from "./types"

export class WebSocketConnectionClosedError extends ConnectionClosedError {
    constructor(
        readonly code: number,
        readonly reason: string,
        options?: ErrorOptions,
    ) {
        super(`Code ${code} (${reason})`, options)
    }
}

function eventToError(event: Event): Error {
    if (event instanceof Error) return event
    return "error" in event ? (event.error as Error) : new Error("Unknown websocket error", { cause: event })
}

abstract class WebSocketConnectionBase implements Closable {
    protected _error: Error | null = null
    protected _cv: ConditionVariable

    constructor(readonly socket: WebSocket) {
        this._cv = new ConditionVariable()
        socket.addEventListener("message", (event) => {
            this.onMessage(event)
            this._cv.notify()
        })
        socket.addEventListener("close", (event) => {
            if (this._error) return
            this._error = new WebSocketConnectionClosedError(event.code, event.reason, { cause: event })
            this._cv.notify()
        })
        socket.addEventListener("error", (event) => {
            if (this._error) return
            this._error = eventToError(event)
            this._cv.notify()
        })
    }

    get remoteAddress(): string | null {
        return this.socket.url
    }

    close(): void {
        this.socket?.close()
        this._error = new ConnectionClosedError()
        this._cv.notify()
    }

    closeWithCode(code: number, reason?: string): void {
        this.socket.close(code, reason)
        this._cv.notify()
    }

    abstract onMessage(event: MessageEvent): void
}

export class WebSocketConnection extends WebSocketConnectionBase implements Connection<string, never> {
    #buffer = Bytes.allocate(0)

    get localAddress(): null {
        return null
    }

    onMessage(event: MessageEvent): void {
        if (typeof event.data === "string") {
            let buffer = this.#buffer.writeSync(utf8.encodedLength(event.data))
            utf8.encoder.encodeInto(event.data, buffer)
        } else {
            let u8 = new Uint8Array(event.data)
            this.#buffer.writeSync(u8.length).set(u8)
        }
        this.#buffer.disposeWriteSync()
    }

    async read(into: Uint8Array): Promise<number> {
        if (this.#buffer.available > 0) {
            let size = Math.min(this.#buffer.available, into.length)
            into.set(this.#buffer.readSync(size))
            this.#buffer.reclaim()
            return size
        }

        if (this._error !== null) throw this._error
        await this._cv.wait()
        if (this._error !== null) throw this._error

        let size = Math.min(this.#buffer.available, into.length)
        into.set(this.#buffer.readSync(size))
        this.#buffer.reclaim()
        return size
    }

    async write(bytes: Uint8Array): Promise<void> {
        if (this._error !== null) throw this._error
        if (!bytes.length) return
        this.socket.send(bytes as any)
    }
}

export interface WebSocketConnectionFramed extends Closable {
    readFrame: () => Promise<Uint8Array | string>
    writeFrame: (frame: Uint8Array | string) => Promise<void>
}

export class WebSocketConnectionFramedBase extends WebSocketConnectionBase implements WebSocketConnectionFramed {
    #buffer = new Deque()

    onMessage(event: MessageEvent): void {
        if (typeof event.data === "string") this.#buffer.pushBack(event.data)
        else this.#buffer.pushBack(new Uint8Array(event.data))
    }

    async readFrame(): Promise<Uint8Array | string> {
        if (!this.#buffer.isEmpty()) return this.#buffer.popFront() as Uint8Array
        if (this._error !== null) throw this._error
        await this._cv.wait()
        if (this._error !== null) throw this._error

        return this.#buffer.popFront() as Uint8Array
    }

    async writeFrame(data: Uint8Array | string): Promise<void> {
        if (this._error !== null) throw this._error
        this.socket.send(data as any)
    }
}

export interface WebSocketConstructor {
    new (url: string | URL, protocols?: Array<string> | string): WebSocket
}

export interface WebSocketEndpoint {
    readonly url: string | URL
    readonly implementation?: WebSocketConstructor
    readonly protocols?: Array<string> | string
}

export const connectWs: ConnectFunction<WebSocketEndpoint, WebSocketConnection> = (endpoint) => {
    let { url, implementation: WebSocketImpl = WebSocket, protocols } = endpoint
    return new Promise((resolve, reject) => {
        let socket = new WebSocketImpl(url, protocols)
        socket.binaryType = "arraybuffer"
        const onError = (event: Event) => {
            socket.removeEventListener("error", onError)
            reject(eventToError(event))
        }
        socket.addEventListener("error", onError)
        socket.addEventListener("open", () => {
            socket.removeEventListener("error", onError)
            resolve(new WebSocketConnection(socket))
        })
    })
}

export async function connectWsFramed(endpoint: WebSocketEndpoint): Promise<WebSocketConnectionFramed> {
    let { url, implementation: WebSocketImpl = WebSocket, protocols } = endpoint

    return new Promise((resolve, reject) => {
        let socket = new WebSocketImpl(url, protocols)
        socket.binaryType = "arraybuffer"

        const onError = (event: Event) => {
            socket.removeEventListener("error", onError)
            reject(eventToError(event))
        }
        socket.addEventListener("error", onError)
        socket.addEventListener("open", () => {
            socket.removeEventListener("error", onError)
            resolve(new WebSocketConnectionFramedBase(socket))
        })
    })
}
