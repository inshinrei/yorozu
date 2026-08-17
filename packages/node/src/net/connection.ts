import { Bytes, Closable, Readable, Writable } from "@yorozu/io"
import type { Socket } from "node:net"
import type { TLSSocket } from "node:tls"
import { asNonNull, ConditionVariable, unknownToError } from "@yorozu/utils"
import { ConnectionClosedError, TCPConnection, TCPEndpoint, TLSConnection } from "@yorozu/net"

export interface NodeConnectionOptions {
    bufferSize?: number
}

class NodeSocketConnection<Sock extends Socket | TLSSocket> implements Readable, Writable, Closable {
    #error: Error | null = null
    #buffer: Bytes
    #cv = new ConditionVariable()

    constructor(
        readonly socket: Sock,
        options: NodeConnectionOptions = {},
    ) {
        if (socket.pending) throw new Error("Socket is not connected.")
        if (socket.destroyed) throw new Error("Socket is destroyed.")
        this.#buffer = Bytes.allocate(options.bufferSize)

        socket.resume()

        const onData = (data: Buffer) => {
            this.#buffer.writeSync(data.length).set(data)
            this.#cv.notify()
        }

        const onClose = () => {
            this.#error = new ConnectionClosedError()
            this.#cv.notify()
        }

        const onError = (err: unknown) => {
            this.#error = unknownToError(err)
            this.#cv.notify()
        }

        socket.on("data", onData)
        socket.on("close", onClose)
        socket.on("error", onError)
    }

    close(): void {
        this.socket?.destroy()
        this.#error = new ConnectionClosedError()
        this.#cv.notify()
    }

    async read(into: Uint8Array): Promise<number> {
        if (this.#buffer.available > 0) {
            let size = Math.min(this.#buffer.available, into.length)
            into.set(this.#buffer.readSync(size))
            this.#buffer.reclaim()
            return size
        }

        if (this.#error !== null) throw this.#error
        await this.#cv.wait()
        if (this.#error !== null) throw this.#error

        let size = Math.min(this.#buffer.available, into.length)
        into.set(this.#buffer.readSync(size))
        this.#buffer.reclaim()
        return size
    }

    async write(bytes: Uint8Array): Promise<void> {
        if (this.#error) throw this.#error
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
