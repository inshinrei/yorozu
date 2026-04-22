import { Ipv4Address } from "./types"
import { u8 } from "@yorozu/utils"

export function parseV4(input: string): Ipv4Address {
    let parts = u8.allocate(4)
    let octets = input.split(".")
    let octetsCount = octets.length

    if (octetsCount === 1) {
        let num = Number(octets[0])
        if (Number.isNaN(num) || num < 0 || num > 4294967295) {
            throw new RangeError(`Invalid IPv4 address: ${input}.`)
        }
        parts[0] = (num >> 24) & 0xff
        parts[1] = (num >> 16) & 0xff
        parts[2] = (num >> 8) & 0xff
        parts[3] = num & 0xff
        return { type: "ipv4", parts }
    }

    if (octetsCount !== 4) {
        throw new RangeError(`Invalid IPv4 address: ${input}.`)
    }

    for (let i = 0; i < 4; i++) {
        let part = Number(octets[i])
        if (Number.isNaN(part) || part < 0 || part > 255) {
            throw new RangeError(`Invalid IPv4 address: ${input}.`)
        }
        parts[i] = part
    }

    return { type: "ipv4", parts }
}

export function stringifyV4(ip: Ipv4Address): string {
    if (ip.parts.length !== 4) {
        throw new RangeError(`Invalid IPv4 address: ${ip}.`)
    }
    return ip.parts.join(".")
}

export function normalizeV4(input: string): string {
    return stringifyV4(parseV4(input))
}
