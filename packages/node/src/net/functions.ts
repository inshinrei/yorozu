import { Server, Socket } from "node:net"
import {
    connect as nodeTlsConnect,
    type ConnectionOptions,
    createSecureContext,
    createServer as tlsCreateServer,
    type SecureContext,
    type SecureContextOptions,
    type TlsOptions,
} from "node:tls"
import {
    ConnectFunction,
    ListenFunction,
    TCPConnection,
    TCPEndpoint,
    TLSConnectOptions,
    TLSListenOptions,
    TLSOptions,
    TLSUpgradeFunction,
} from "@yorozu/net"
import { TcpConnection, TlsConnection } from "./connection"
import { TCPListener, TLSListener } from "./listener"

function awaitConnect(socket: Socket) {
    return new Promise<void>((resolve, reject) => {
        socket.on("error", reject)
        socket.once("connect", () => {
            socket.off("error", reject)
            resolve()
        })
    })
}

export const connectTCP: ConnectFunction<TCPEndpoint, TCPConnection> = async ({ address, port }) => {
    let socket = new Socket()
    socket.connect(port, address)
    await awaitConnect(socket)
    return new TcpConnection(socket)
}

export interface NodeTLSConnectOptions extends TLSConnectOptions {
    extraOptions?: ConnectionOptions
}

export const connectTLS: ConnectFunction<NodeTLSConnectOptions, TlsConnection> = async (options) => {
    let { address, port, sni, caCerts, alpnProtocols, extraOptions } = options
    let socket = nodeTlsConnect({
        host: address,
        port,
        ca: caCerts,
        ALPNProtocols: alpnProtocols,
        servername: sni,
        ...extraOptions,
    })
    await awaitConnect(socket)
    return new TlsConnection(socket)
}

export const listenTCP: ListenFunction<TCPEndpoint, TCPListener> = async ({ address, port }) => {
    return new Promise((resolve, reject) => {
        let server = new Server()
        server.on("error", reject)
        server.listen(port, address, () => {
            server.off("error", reject)
            resolve(new TCPListener(server))
        })
    })
}

export interface NodeTLSUpgradeOptions extends TLSOptions {
    extraOptions?: ConnectionOptions
}

export const upgradeTLS: TLSUpgradeFunction<NodeTLSUpgradeOptions, TcpConnection, TlsConnection> = async (
    _connect,
    options,
) => {
    return new Promise((resolve, reject) => {
        const tlsSocket = nodeTlsConnect(
            {
                socket: _connect.socket,
                ca: options.caCerts,
                ALPNProtocols: options.alpnProtocols,
                servername: options.sni,
                ...options.extraOptions,
            },
            () => {
                tlsSocket.off("error", onError)
                resolve(new TlsConnection(tlsSocket))
            },
        )

        const onError = (err: unknown) => {
            reject(err)
            _connect.close()
        }

        tlsSocket.on("error", onError)
    })
}

export interface NodeTLSListenOptions extends TLSListenOptions {
    extraOptions?: SecureContextOptions
}

function hostToSecureContextOptions(host: NonNullable<NodeTLSListenOptions["hosts"]>[0]): SecureContextOptions {
    let { key, cert, caCerts, extraOptions } = host
    return {
        key,
        cert,
        ca: caCerts,
        ...extraOptions,
    }
}

export const listenTLS: ListenFunction<TLSListenOptions, TLSListener> = async (options) => {
    let hosts = options.hosts ?? [options]
    let listenOptions: TlsOptions
    if (hosts.length === 1) {
        listenOptions = {
            ALPNProtocols: options.alpnProtocols,
            ...hostToSecureContextOptions(hosts[0]),
        }
    } else {
        let secureContexts = new Map<string, SecureContext>()
        for (let host of hosts) {
            if (host.sni == null) throw new Error(`SNI is required for multi-host setups.`)
            secureContexts.set(host.sni, createSecureContext(hostToSecureContextOptions(host)))
        }

        listenOptions = {
            ALPNProtocols: options.alpnProtocols,
            SNICallback: (hostname, cb) => {
                let ctx = secureContexts.get(hostname)
                if (ctx) {
                    cb(null, ctx)
                    return
                }

                cb(new Error("No matching host found."))
            },
        }
    }

    let socket = tlsCreateServer(listenOptions)
    socket.listen(options.port, options.address)
    return new TLSListener(socket)
}
