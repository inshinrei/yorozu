import { ConnectFunction, TCPConnection, TCPEndpoint } from "../../types"
import { SocksProxySettings } from "./types"
import { performSocksHandshake } from "./connect"

export function withSocksProxy<
    Connection extends TCPConnection,
    Connect extends ConnectFunction<TCPEndpoint, Connection>,
>(connect: Connect, proxy: SocksProxySettings): Connect {
    return (async (endpoint) => {
        let _connect = await connect({
            address: proxy.host,
            port: proxy.port,
        })
        await performSocksHandshake(_connect, _connect, proxy, endpoint)
        return _connect
    }) as Connect
}
