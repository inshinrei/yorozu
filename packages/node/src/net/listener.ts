import type { AddressInfo, Server as TCPServer, Socket } from "node:net"
import type { Server as TLSServer, TLSSocket } from "node:tls"
import { Connection, Listener, ListenerClosedError, TCPConnection, TCPEndpoint } from "@yorozu/net"
import { Deferred } from "@yorozu/utils"
import { TcpConnection, TlsConnection } from "./connection"

abstract class NodeListener<
    Server extends TCPServer | TLSServer,
    Address,
    C extends Connection<Address>,
> implements Listener<Address, C> {
    protected _waiter?: Deferred<C>
    #closed = false

    constructor(readonly server: Server) {
        const onClose = () => {
            this._waiter?.reject(new ListenerClosedError())
        }

        const onError = (err: unknown) => {
            this._waiter?.reject(err)
        }

        server.on("close", onClose)
        server.on("error", onError)
    }

    get address(): Address {
        return this.mapAddress(this.server.address())
    }

    async accept(): Promise<C> {
        if (this.#closed) throw new ListenerClosedError()
        this._waiter = new Deferred()
        let connection = await this._waiter.promise
        this._waiter = undefined
        return connection
    }

    close(): void {
        this._waiter?.reject(new ListenerClosedError())
        this._waiter = undefined
        this.server.close()
    }

    protected abstract mapAddress(address: AddressInfo | string | null): Address
}

export class TCPListener extends NodeListener<TCPServer, TCPEndpoint, TCPConnection> {
    constructor(readonly server: TCPServer) {
        super(server)

        const onConnection = (socket: Socket) => {
            if (!this._waiter) {
                socket.destroy()
                return
            }

            this._waiter.resolve(new TcpConnection(socket))
            this._waiter = undefined
        }

        server.on("connection", onConnection)
    }

    mapAddress(addr: AddressInfo | string | null): TCPEndpoint {
        if (addr === null || typeof addr === "string") throw new Error("Listener is not bound.")
        return {
            address: addr.address,
            port: addr.port,
        }
    }

    mapConnection(socket: Socket): TCPConnection {
        return new TcpConnection(socket)
    }
}

export class TLSListener extends NodeListener<TLSServer, TCPEndpoint, TlsConnection> {
    constructor(readonly server: TLSServer) {
        super(server)

        const onSecureConnection = (socket: TLSSocket) => {
            if (!this._waiter) {
                socket.destroy()
                return
            }

            this._waiter.resolve(new TlsConnection(socket))
            this._waiter = undefined
        }

        server.on("secureConnection", onSecureConnection)
    }

    mapAddress(addr: AddressInfo | string | null): TCPEndpoint {
        if (addr === null || typeof addr === "string") throw new Error("Listener is not bound.")
        return {
            address: addr.address,
            port: addr.port,
        }
    }
}
