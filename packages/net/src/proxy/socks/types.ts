export class SocksProxyConnectionError extends Error {
    readonly proxy: SocksProxySettings

    constructor(proxy: SocksProxySettings, message: string) {
        super(`Error while connecting to ${proxy.host}:${proxy.port}: ${message}`)
        this.proxy = proxy
    }
}

export interface SocksProxySettings {
    host: string
    port: number
    user?: string
    password?: string
    version?: 4 | 5
}
