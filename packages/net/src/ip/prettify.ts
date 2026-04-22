export interface PrettifyOptions {
    encloseIpv6?: boolean
}

export function prettify(address: string, options: PrettifyOptions = {}): string {
    let { encloseIpv6 = false } = options
    if (!address) return ""
    let input = address.trim()
    if (input.startsWith("[") && input.endsWith("]")) {
        let inner = input.slice(1, -1)
        return encloseIpv6 ? input : inner
    }

    try {
        let url = new URL(`https://${input}`)
        let hostname = url.hostname
        if (hostname.includes(":")) return encloseIpv6 ? hostname : hostname.slice(1, -1)
        return hostname
    } catch {
        return input
    }
}
