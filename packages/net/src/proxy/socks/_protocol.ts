import { TCPEndpoint } from "../../types"
import { ip } from "../../index"
import { u8, utf8 } from "@yorozu/utils"
import { Bytes, write } from "@yorozu/io"

export const Socks4Errors: Record<number, string> = {
    91: "Request rejected or failed",
    92: "Request failed because client is not running identd",
    93: "Request failed because client's identd could not confirm the user ID in the request",
}

export const Socks5Errors: Record<number, string> = {
    1: "General failure",
    2: "Connection not allowed by ruleset",
    3: "Network unreachable",
    4: "Host unreachable",
    5: "Connection refused by destination host",
    6: "TTL expired",
    7: "Command not supported / protocol error",
    8: "Address type not supported",
}

export function buildSocks4Connect(dest: TCPEndpoint, username = ""): Uint8Array {
    let addr
    try {
        addr = ip.parse(dest.address)
    } catch {}

    let isHostname = !addr
    if (isHostname) {
        addr = { type: "ipv4", parts: u8.allocateWith([0, 0, 0, 0x2a]) }
    } else if (addr?.type !== "ipv4") {
        throw new TypeError("Socks4 only supports IPv4.")
    }

    let userLen = utf8.encodedLength(username) + 1
    let hostLen = isHostname ? utf8.encodedLength(dest.address) + 1 : 0

    let buf = Bytes.allocate(8 + userLen + hostLen)
    write.uint8(buf, 0x04)
    write.uint8(buf, 0x01)
    write.uint16be(buf, dest.port)
    write.bytes(buf, addr.parts)
    write.cUtf8String(buf, username)
    if (isHostname) write.cUtf8String(buf, dest.address)
    return buf.result()
}

export function buildSocks5Greeting(authAvailable: boolean): Uint8Array {
    let buf = u8.allocate(authAvailable ? 4 : 3)
    buf[0] = 0x05
    if (authAvailable) {
        buf[1] = 0x02
        buf[2] = 0x00
        buf[3] = 0x02
    } else {
        buf[1] = 0x01
        buf[2] = 0x00
    }
    return buf
}

export function buildSocks5Auth(username: string, password: string): Uint8Array {
    let usernameLen = utf8.encodedLength(username)
    let passwordLen = utf8.encodedLength(password)
    if (usernameLen > 255) throw new TypeError(`Too long username (${usernameLen} > 255).`)
    if (passwordLen > 255) throw new TypeError(`Too long password (${passwordLen} > 255).`)

    let buf = u8.allocate(3 + usernameLen + passwordLen)
    buf[0] = 0x01
    buf[1] = usernameLen
    utf8.encoder.encodeInto(username, buf.subarray(2))
    buf[2 + usernameLen] = passwordLen
    utf8.encoder.encodeInto(password, buf.subarray(3 + usernameLen))
    return buf
}

export function buildSocks5Connect(dest: TCPEndpoint): Uint8Array {
    let addr
    try {
        addr = ip.parse(dest.address)
    } catch {}

    let addrSize = !addr ? utf8.encodedLength(dest.address) + 2 : addr.type === "ipv6" ? 16 : 4

    let buf = Bytes.allocate(6 + addrSize)
    write.uint8(buf, 0x05)
    write.uint8(buf, 0x01)
    write.uint8(buf, 0x00)

    if (!addr) {
        let len = utf8.encodedLength(dest.address)
        if (len > 255) throw new TypeError(`Too long address (${len} > 255).`)
        write.uint8(buf, 0x03)
        write.uint8(buf, len)
        write.utf8String(buf, dest.address)
    } else if (addr.type === "ipv6") {
        write.uint8(buf, 0x04)
        ip.writeV6(addr, buf)
    } else {
        write.uint8(buf, 0x01)
        write.bytes(buf, addr.parts)
    }
    write.uint16be(buf, dest.port)
    return buf.result()
}
