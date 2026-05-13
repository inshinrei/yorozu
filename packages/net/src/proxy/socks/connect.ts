import { read, Readable, Writable } from "@yorozu/io"
import { SocksProxyConnectionError, SocksProxySettings } from "./types"
import { TCPEndpoint } from "../../types"
import {
    buildSocks4Connect,
    buildSocks5Auth,
    buildSocks5Connect,
    buildSocks5Greeting,
    Socks4Errors,
    Socks5Errors,
} from "./_protocol"

async function connectV4(
    reader: Readable,
    writer: Writable,
    proxy: SocksProxySettings,
    dest: TCPEndpoint,
): Promise<void> {
    await writer.write(buildSocks4Connect(dest, proxy.user))
    let response = await read.async.exactly(reader, 8)

    if (response[0] !== 0x00)
        throw new SocksProxyConnectionError(proxy, `Unexpected response first byte: ${response[0]}.`)

    if (response[1] !== 0x5a) {
        let code = response[1]
        throw new SocksProxyConnectionError(
            proxy,
            code in Socks4Errors ? Socks4Errors[code] : `Unknown error code: ${code}.`,
        )
    }
}

async function connectV5(
    reader: Readable,
    writer: Writable,
    proxy: SocksProxySettings,
    dest: TCPEndpoint,
): Promise<void> {
    await writer.write(buildSocks5Greeting(proxy.user != null))

    let greetingRes = await read.async.exactly(reader, 2)

    if (greetingRes[0] !== 0x05)
        throw new SocksProxyConnectionError(proxy, `Unexpected response first byte: ${greetingRes[0]}.`)

    if (greetingRes[1] === 0x02) {
        if (proxy.user == null || proxy.password == null)
            throw new SocksProxyConnectionError(proxy, `Authorization is required, but not provided.`)

        await writer.write(buildSocks5Auth(proxy.user, proxy.password))

        let authRes = await read.async.exactly(reader, 2)
        if (authRes[0] !== 0x01)
            throw new SocksProxyConnectionError(proxy, `Invalid SOCKS auth version: ${authRes[0]}.`)

        if (authRes[1] !== 0x00) throw new SocksProxyConnectionError(proxy, `Authentication failed.`)
    } else if (greetingRes[1] !== 0x00) {
        throw new SocksProxyConnectionError(proxy, `Unsupported authorization method: ${greetingRes[1]}.`)
    }

    await writer.write(buildSocks5Connect(dest))

    let response = await read.async.exactly(reader, 4)

    if (response[0] !== 0x05)
        throw new SocksProxyConnectionError(proxy, `Unexpected response first byte: ${response[0]}.`)

    if (response[1] !== 0x00) {
        let code = response[1]
        throw new SocksProxyConnectionError(
            proxy,
            code in Socks5Errors ? Socks5Errors[code] : `Unknown error code: ${code}.`,
        )
    }

    switch (response[3]) {
        case 0x01: {
            await read.async.exactly(reader, 6)
            break
        }
        case 0x04: {
            await read.async.exactly(reader, 18)
            break
        }
        default:
            throw new SocksProxyConnectionError(proxy, `Invalid BNDADDR type: ${response[3]}.`)
    }
}

export async function performSocksHandshake(
    reader: Readable,
    writer: Writable,
    proxy: SocksProxySettings,
    dest: TCPEndpoint,
): Promise<void> {
    if (proxy.version != null && proxy.version !== 4 && proxy.version !== 5)
        throw new SocksProxyConnectionError(proxy, `Invalid SOCKS version: ${proxy.version}.`)

    if (proxy.version === 4) {
        return connectV4(reader, writer, proxy, dest)
    }

    return connectV5(reader, writer, proxy, dest)
}
