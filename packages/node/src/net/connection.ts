import { Bytes, Closable, Readable, Writable } from "@yorozu/io"
import type { Socket } from "node:net"
import type { TLSSocket } from "node:tls"
import { asNonNull, ConditionVariable, unknownToError } from "@yorozu/utils"
import { ConnectionClosedError, TCPConnection, TCPEndpoint, TLSConnection } from "@yorozu/net"

export interface NodeConnectionOptions {
    bufferSize?: number
}

class NodeSocketConnection<Sock extends Socket | TLSSocket> implements Readable, Writable, Closable {
    protected _error: Error | null = null
    protected _buffer: Bytes
    protected _cv: ConditionVariable = new ConditionVariable()

    constructor(
        readonly socket: Sock,
        options: NodeConnectionOptions = {},
    ) {
        if (socket.pending) throw new Error("Socket is not connected.")
        if (socket.destroyed) throw new Error("Socket is destroyed.")
        this._buffer = Bytes.allocate(options.bufferSize)

        socket.resume()

        const onData = (data: Buffer) => {
            this._buffer.writeSync(data.length).set(data)
            this._cv.notify()
        }

        const onClose = () => {
            this._error = new ConnectionClosedError()
            this._cv.notify()
        }

        const onError = (err: unknown) => {
            this._error = unknownToError(err)
            this._cv.notify()
        }

        socket.on("data", onData)
        socket.on("close", onClose)
        socket.on("error", onError)
    }

    close(): void {
        this.socket?.destroy()
        this._error = new ConnectionClosedError()
        this._cv.notify()
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
        if (this._error !== null) throw this._error

        let size = Math.min(this._buffer.available, into.length)
        into.set(this._buffer.readSync(size))
        this._buffer.reclaim()
        return size
    }

    async write(bytes: Uint8Array): Promise<void> {
        if (this._error) throw this._error
        return new Promise<void>((resolve, reject) => {
            this.socket.write(bytes, (error) => {
                if (error) reject(error)
                else resolve()
            })
        })
    }
}

export class TcpConnection extends NodeSocketConnection<Socket> implements TCPConnection {
    get localAddress(): TCPEndpoint {
        return {
            address: asNonNull(this.socket.localAddress),
            port: asNonNull(this.socket.localPort),
        }
    }

    get remoteAddress(): TCPEndpoint {
        return {
            address: asNonNull(this.socket.remoteAddress),
            port: asNonNull(this.socket.remotePort),
        }
    }

    setKeepAlive(keepAlive?: boolean): void {
        this.socket.setKeepAlive(keepAlive)
    }

    setNoDelay(noDelay?: boolean): void {
        this.socket.setNoDelay(noDelay)
    }
}

export class TlsConnection extends NodeSocketConnection<TLSSocket> implements TLSConnection {
    get localAddress(): TCPEndpoint {
        return {
            address: asNonNull(this.socket.localAddress),
            port: asNonNull(this.socket.localPort),
        }
    }

    get remoteAddress(): TCPEndpoint {
        return {
            address: asNonNull(this.socket.remoteAddress),
            port: asNonNull(this.socket.remotePort),
        }
    }

    setKeepAlive(keepAlive?: boolean): void {
        this.socket.setKeepAlive(keepAlive)
    }

    setNoDelay(noDelay?: boolean): void {
        this.socket.setNoDelay(noDelay)
    }

    getAlpnProtocol(): string | null {
        let proto = this.socket.alpnProtocol
        if (proto === false) return null
        return proto
    }
}
