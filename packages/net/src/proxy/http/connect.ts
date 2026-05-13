import { typed, u8, utf8 } from "@yorozu/utils"
import { read, Readable, Writable } from "@yorozu/io"
import { HttpProxyConnectionError, HttpProxySettings } from "./types"
import { TCPEndpoint } from "../../types"
import { buildConnectRequest } from "./_protocol"

let HTTP1_0_OK = utf8.encoder.encode("HTTP/1.0 200")
let HTTP1_1_OK = utf8.encoder.encode("HTTP/1.1 200")
let DOUBLE_CRLF = new Uint8Array([13, 10, 13, 10])

export async function performHttpProxyHandshake(
    reader: Readable,
    writer: Writable,
    proxy: HttpProxySettings,
    destination: TCPEndpoint,
): Promise<void> {
    await writer.write(buildConnectRequest(proxy, destination))

    let status = await read.async.exactly(reader, 12)
    if (!typed.equal(status, HTTP1_0_OK) && !typed.equal(status, HTTP1_1_OK)) {
        throw new HttpProxyConnectionError(proxy, `Invalid HTTP response: ${utf8.decoder.decode(status)}`)
    }

    let window = u8.allocate(4)

    while (true) {
        let byte = await read.async.exactly(reader, 1)
        window.copyWithin(0, 1)
        window[3] = byte[0]!

        if (typed.equal(window, DOUBLE_CRLF)) {
            break
        }
    }
}
