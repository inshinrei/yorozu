import { ConditionVariable, Deferred, Deque } from "@yorozu/utils"
import { ServerOptions, type WebSocket, WebSocketServer } from "ws"
import { IncomingMessage } from "node:http"
import {
    ConnectionClosedError,
    Listener,
    ListenerClosedError,
    TCPEndpoint,
    WebSocketConnectionClosedError,
    WebSocketServerConnection,
    WebSocketServerConnectionFramed,
} from "@yorozu/net"
import { Bytes } from "@yorozu/io"
import { Duplex } from "node:stream"

abstract class NodeWebSocketConnectionBase {
    protected _error: Error | null = null
    protected _cv: ConditionVariable = new ConditionVariable()
    protected _headers?: Headers

    constructor(
        readonly socket: WebSocket,
        readonly request: IncomingMessage,
    ) {
        socket.binaryType = "nodebuffer"

        const onMessage = (data: Buffer, isBinary: boolean) => {
            this.onMessage(data, isBinary)
            this._cv.notify()
        }

        const onClose = (code: number, reason: Buffer) => {
            if (this._error) return
            this._error = new WebSocketConnectionClosedError(code, reason.toString("utf-8"))
            this._cv.notify()
        }

        const onError = (err: unknown) => {
            if (this._error) return
            this._error = err as Error
            this._cv.notify()
        }

        socket.on("message", onMessage)
        socket.on("close", onClose)
        socket.on("error", onError)
    }

    get headers(): Headers {
        if (!this._headers) {
            let headers = new Headers()
            this._headers = headers
            for (let [key, value] of Object.entries(this.request.headers)) {
                if (value == null) continue
                if (Array.isArray(value)) {
                    for (let v of value) {
                        headers.append(key, v)
                    }
                } else {
                    headers.set(key, value)
                }
            }
        }

        return this._headers
    }

    get url(): string {
        return this.request.url ?? this.socket.url
    }

    get localAddress(): null {
        return null
    }

    get remoteAddress(): TCPEndpoint | null {
        if (this.request.socket.remoteAddress == null) return null
        return {
            address: this.request.socket.remoteAddress,
            port: this.request.socket.remotePort ?? 0,
        }
    }

    close(): void {
        this.socket.close()
        this._error = new ConnectionClosedError()
        this._cv.notify()
    }

    abstract onMessage(data: Buffer, isBinary: boolean): void
}

class NodeWebSocketConnection extends NodeWebSocketConnectionBase implements WebSocketServerConnection {
    protected _buffer: Bytes = Bytes.allocate(0)

    onMessage(data: Buffer): void {
        this._buffer.writeSync(data.length).set(data)
        this._buffer.disposeWriteSync()
    }

    async read(into: Uint8Array): Promise<number> {
        if (this._buffer.available > 0) {
            let size = Math.min(this._buffer.available, into.length)
            into.set(this._buffer.readSync(size))
            this._buffer.reclaim()
            return size
        }

        if (this._error !== null) throw this._error
        await this._cv.wait()
        if (this._error) throw this._error

        let size = Math.min(this._buffer.available, into.length)
        into.set(this._buffer.readSync(size))
        this._buffer.reclaim()
        return size
    }

    async write(bytes: Uint8Array): Promise<void> {
        if (this._error) throw this._error
        if (!bytes.length) return
        this.socket.send(bytes)
    }
}

class NodeWebSocketConnectionFramed extends NodeWebSocketConnectionBase implements WebSocketServerConnectionFramed {
    protected _buffer: Deque<string | Uint8Array> = new Deque()

    onMessage(data: Buffer, isBinary: boolean): void {
        if (isBinary) this._buffer.pushBack(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
        else this._buffer.pushBack(data.toString("utf-8"))
    }

    async readFrame(): Promise<Uint8Array | string> {
        if (!this._buffer.isEmpty()) {
            return this._buffer.popFront()!
        }

        if (this._error !== null) throw this._error
        await this._cv.wait()
        if (this._error !== null) throw this._error

        return this._buffer.popFront()!
    }

    async writeFrame(data: Uint8Array | string): Promise<void> {
        if (this._error !== null) throw this._error
        this.socket.send(data)
    }
}

abstract class NodeWebSocketServerBase<Connection> {
    protected _closed = false
    protected _waiter?: Deferred<Connection>

    constructor(readonly server: WebSocketServer) {
        const onConnection = (socket: WebSocket, request: IncomingMessage) => {
            if (!this._waiter) {
                socket.close()
                return
            }

            this._waiter.resolve(this.makeConnection(socket, request))
            this._waiter = undefined
        }

        const onError = (err: unknown) => {
            this._waiter?.reject(err)
        }

        const onClose = () => {
            this._waiter?.reject(new ListenerClosedError())
        }

        server.on("connection", onConnection)
        server.on("error", onError)
        server.on("close", onClose)
    }

    get address(): TCPEndpoint | null {
        let addr = this.server.address()
        if (addr == null) return null
        if (typeof addr === "string") {
            let [host, port] = addr.split(":")
            return {
                address: host,
                port: Number.parseInt(port),
            }
        }

        return {
            address: addr.address,
            port: addr.port,
        }
    }

    abstract makeConnection(socket: WebSocket, request: IncomingMessage): Connection

    close(): void {
        this.server.close()
    }

    async accept(): Promise<Connection> {
        if (this._closed) throw new ListenerClosedError()

        this._waiter = new Deferred()
        let connection = await this._waiter.promise
        this._waiter = undefined
        return connection
    }

    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
        if (!this._waiter) {
            socket.destroy()
            return
        }

        let waiter = this._waiter
        this._waiter = undefined
        this.server.handleUpgrade(req, socket, head, (socket, _req) => {
            waiter.resolve(this.makeConnection(socket, _req))
        })
    }
}

export class NodeWebSocketServer
    extends NodeWebSocketServerBase<NodeWebSocketConnection>
    implements Listener<TCPEndpoint, WebSocketServerConnection>
{
    makeConnection(socket: WebSocket, request: IncomingMessage): NodeWebSocketConnection {
        return new NodeWebSocketConnection(socket, request)
    }
}

export class NodeWebSocketServerFramed extends NodeWebSocketServerBase<NodeWebSocketConnectionFramed> {
    makeConnection(socket: WebSocket, request: IncomingMessage): NodeWebSocketConnectionFramed {
        return new NodeWebSocketConnectionFramed(socket, request)
    }
}

export function listenWs(options: ServerOptions): NodeWebSocketServer {
    return new NodeWebSocketServer(new WebSocketServer(options))
}

export function listenWsFramed(options: ServerOptions): NodeWebSocketServerFramed {
    return new NodeWebSocketServerFramed(new WebSocketServer(options))
}
