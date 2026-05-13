export class HttpProxyConnectionError extends Error {
    readonly proxy: HttpProxySettings

    constructor(proxy: HttpProxySettings, message: string) {
        super(`Error while connecting to ${proxy.host}:${proxy.port}: ${message}`)
        this.proxy = proxy
    }
}

export interface HttpProxySettings {
    host: string
    port: number
    user?: string
    password?: string
    headers?: Record<string, string>
}
