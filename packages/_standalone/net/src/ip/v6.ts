import { Ipv6Address } from "./types"
import { typed, u8 } from "@yorozu/utils"
import { read, SyncReadable, SyncWritable } from "@yorozu/io"
import { parseV4 } from "./v4"

const Ipv6Parts = 8

export function parseV6(input: string): Ipv6Address {
    let address = input.trim()

    if (!address) throw new RangeError(`Invalid IPv6 address: ${input}.`)

    // Remove brackets if present: [2001:db8::1] or [fe80::1%eth0]
    if (address.startsWith("[") && address.endsWith("]")) {
        address = address.slice(1, -1)
    }

    // Extract zone ID (e.g. fe80::1%eth0)
    let zoneId: string | undefined
    const percentIndex = address.indexOf("%")
    if (percentIndex !== -1) {
        zoneId = address.slice(percentIndex + 1)
        address = address.slice(0, percentIndex)
    }

    const segments = address.split(":")
    let parsed: number[] = []
    let doubleColonIndex = -1

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]

        if (seg === "") {
            if (doubleColonIndex !== -1) {
                throw new RangeError(`Invalid IPv6 address (multiple double colons) ${input}.`)
            }
            doubleColonIndex = parsed.length
            continue
        }

        // IPv4-mapped address (e.g. ::ffff:192.168.1.1)
        if (seg.includes(".")) {
            if (i !== segments.length - 1) {
                throw new RangeError(`Invalid IPv6 address: ${input}.`)
            }
            const ipv4 = parseV4(seg)
            parsed.push((ipv4.parts[0] << 8) | ipv4.parts[1])
            parsed.push((ipv4.parts[2] << 8) | ipv4.parts[3])
            continue
        }

        const value = Number.parseInt(seg, 16)
        if (Number.isNaN(value) || value < 0 || value > 0xffff) {
            throw new RangeError(`Invalid IPv6 part: ${seg} (in ${input}).`)
        }
        parsed.push(value)
    }

    // Handle :: compression
    if (doubleColonIndex !== -1) {
        const missing = Ipv6Parts - parsed.length
        if (missing < 0) throw new RangeError(`Invalid IPv6 address (too many parts: ${input}).`)

        const parts = new Uint16Array(Ipv6Parts)
        let idx = 0

        // parts before ::
        for (let i = 0; i < doubleColonIndex; i++) parts[idx++] = parsed[i]
        // fill zeros
        for (let i = 0; i < missing; i++) parts[idx++] = 0
        // parts after ::
        for (let i = doubleColonIndex; i < parsed.length; i++) parts[idx++] = parsed[i]

        return { type: "ipv6", parts, zoneId }
    }

    // No compression → must be exactly 8 parts
    if (parsed.length !== Ipv6Parts) {
        throw new RangeError(`Invalid IPv6 address (too few parts) ${input}.`)
    }

    return {
        type: "ipv6",
        parts: new Uint16Array(parsed),
        zoneId,
    }
}

export interface StringifyV6Options {
    zeroCompression?: boolean
    fixedLength?: boolean
}

export function stringifyV6(parsed: Ipv6Address, options: StringifyV6Options = {}): string {
    let { zeroCompression = true, fixedLength = false } = options

    let result = ""
    let compressStart = -1
    let compressEnd = 0

    if (zeroCompression) {
        let maxLength = 0
        let maxStart = -1
        let start = -1
        let length = 0

        for (let i = 0; i < parsed.parts.length; i++) {
            if (parsed.parts[i] === 0) {
                if (start === -1) start = i
                length++
            } else {
                if (length > maxLength) {
                    maxLength = length
                    maxStart = start
                }
                start = -1
                length = 0
            }
        }

        if (length > maxLength) {
            maxLength = length
            maxStart = start
        }

        if (maxLength > 1) {
            compressStart = maxStart
            compressEnd = maxStart + maxLength
        }
    }

    let i = 0
    let writeColon = false

    while (i < parsed.parts.length) {
        let part = parsed.parts[i]

        if (i === compressStart) {
            result += "::"
            i = compressEnd
            writeColon = false
            continue
        }

        if (writeColon) result += ":"
        else writeColon = true

        if (fixedLength) {
            if (part < 0x10) result += "000"
            else if (part < 0x100) result += "00"
            else if (part < 0x1000) result += "0"
        }

        result += part.toString(16)
        i += 1
    }

    if (parsed.zoneId != null) {
        result += `%${parsed.zoneId}`
    }

    return result
}

export function expandV6(string: string): string {
    return stringifyV6(parseV6(string), { zeroCompression: false })
}

function _fromBytesInternal(bytes: Uint8Array): Ipv6Address {
    let parts = new Uint16Array(bytes.buffer, bytes.byteOffset, 8)
    if (typed.getPlatformByteOrder() === "little") {
        u8.swap16(bytes)
    }
    return { type: "ipv6", parts }
}

export function fromBytesV6(bytes: Uint8Array): Ipv6Address {
    if (bytes.length !== 16) {
        throw new Error(`Invalid IPv6 address buffer: ${bytes.length} ≠ 16`)
    }
    return _fromBytesInternal(u8.clone(bytes))
}

export function readV6(reader: SyncReadable): Ipv6Address {
    return _fromBytesInternal(read.exactly(reader, 16))
}

export function toBytesV6(parsed: Ipv6Address): Uint8Array {
    let copy = new Uint16Array(parsed.parts)
    let bytes = new Uint8Array(copy.buffer)
    if (typed.getPlatformByteOrder() === "little") {
        u8.swap16(bytes)
    }
    return bytes
}

export function writeV6(parsed: Ipv6Address, writer: SyncWritable): void {
    let buf = writer.writeSync(16)
    buf.set(new Uint8Array(parsed.parts.buffer, parsed.parts.byteOffset, 16))

    if (typed.getPlatformByteOrder() === "little") {
        u8.swap16(buf)
    }
    writer.disposeWriteSync()
}
