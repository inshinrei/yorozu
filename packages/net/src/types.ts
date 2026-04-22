import { Closable, Readable, Writable } from "@yorozu/io"

export interface Connection<Address, LocalAddress = Address> extends Readable, Writable, Closable {
    readonly localAddress: LocalAddress | null
    readonly remoteAddress: Address | null
}

export interface TCPEndpoint {
    readonly address: string
    readonly port: number
}

export interface TLSOptions {
    readonly caCerts?: Array<string>
    readonly alpnProtocols?: Array<string>
    readonly sni?: string
}

export interface TLSConnectOptions extends TCPEndpoint, TLSOptions {}
export interface TLSListenOptions extends TCPEndpoint, TLSOptions {
    readonly key?: string
    readonly cert?: string
    readonly hosts?: Array<Omit<this, "hosts" | "address" | "port">>
}

export interface TCPConnection extends Connection<TCPEndpoint> {
    setNoDelay: (noDelay: boolean) => void
    setKeepAlive: (keepAlive: boolean) => void
}

export interface TLSConnection extends TCPConnection {
    getAlpnProtocol: () => string | null
}

export interface Listener<Address, C extends Connection<Address> = Connection<Address>> extends Closable {
    readonly address: Address
    accept: () => Promise<C>
}

export type ListenFunction<O, L extends Listener<unknown>> = (options: O) => Promise<L>
export type ConnectFunction<O, C extends Connection<unknown>> = (options: O) => Promise<C>
export type TLSUpgradeFunction<O, TCPC extends TCPConnection, TLSC extends TLSConnection> = (
    tcp: TCPC,
    options: O,
) => Promise<TLSC>
