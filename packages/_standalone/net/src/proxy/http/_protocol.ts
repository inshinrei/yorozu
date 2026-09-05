import { HttpProxySettings } from "./types"
import { TCPEndpoint } from "../../types"
import { base64, utf8 } from "@yorozu/utils"

export function buildConnectRequest(options: HttpProxySettings, dest: TCPEndpoint): Uint8Array {
    let addr = dest.address
    if (addr.includes(":")) addr = `[${addr}]`
    let host = `${addr}:${dest.port}`
    let lines: Array<string> = [
        `CONNECT ${host} HTTP/1.1`,
        `Host: ${host}`,
        `User-Agent: @yorozu/net`,
        `Proxy-Connection: Keep-Alive`,
    ]

    if (options.user != null) {
        let auth = options.user
        if (options.password != null) auth += `:${options.password}`
        lines.push(`Proxy-Authorization: Basic ${base64.encode(utf8.encoder.encode(auth))}`)
    }

    if (options.headers) {
        for (let [key, value] of Object.entries(options.headers)) lines.push(`${key}: ${value}`)
    }

    lines.push("", "")
    return utf8.encoder.encode(lines.join("\r\n"))
}
