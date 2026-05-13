import { ConnectFunction, TCPConnection, TCPEndpoint } from "../../types"
import { HttpProxySettings } from "./types"
import { performHttpProxyHandshake } from "./connect"

export * from "./connect"
export * from "./types"

export function withHttpProxy<
    Connection extends TCPConnection,
    Connect extends ConnectFunction<TCPEndpoint, Connection>,
>(connect: Connect, proxy: HttpProxySettings): Connect {
    return (async (endpoint) => {
        let _connect = await connect({
            address: proxy.host,
            port: proxy.port,
        })

        await performHttpProxyHandshake(_connect, _connect, proxy, endpoint)
        return _connect
    }) as Connect
}
