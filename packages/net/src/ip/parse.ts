import { Ipv4Address, Ipv6Address } from "./types"
import { parseV6, stringifyV6 } from "./v6"
import { parseV4, stringifyV4 } from "./v4"

export function parse(ip: string): Ipv4Address | Ipv6Address {
    if (ip.includes(":")) return parseV6(ip)
    else return parseV4(ip)
}

export function parseWithPort(ip: string): [Ipv4Address | Ipv6Address, number] {
    let addr: string
    let portStr: string

    if (ip.startsWith("[")) {
        // bracketed IPv6: [2001:db8::1]:443
        let close = ip.indexOf("]")
        if (close === -1 || ip[close + 1] !== ":") {
            throw new Error(`Invalid address with port: ${ip}`)
        }
        addr = ip.slice(1, close)
        portStr = ip.slice(close + 2)
    } else {
        // IPv4 or plain IPv6
        let lastColon = ip.lastIndexOf(":")
        if (lastColon === -1) {
            throw new Error(`Invalid address with port: ${ip}`)
        }
        addr = ip.slice(0, lastColon)
        portStr = ip.slice(lastColon + 1)
    }

    let port = Number(portStr)
    if (Number.isNaN(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid port ${port} in ${ip}`)
    }

    return [parse(addr), port]
}

export function stringify(parsed: Ipv6Address | Ipv4Address): string {
    if (parsed.type === "ipv4") return stringifyV4(parsed)
    else return stringifyV6(parsed)
}

export function stringifyWithPort(parsed: Ipv4Address | Ipv6Address, port: number): string {
    let host = stringify(parsed)
    if (parsed.type === "ipv6") {
        host = `[${host}]`
    }
    return `${host}:${port}`
}
