import { Readable } from "../../types"
import { u8 } from "@yorozu/utils"
import { PartialReadError } from "../../errors"
import { Bytes } from "../../bytes"

export async function exactly(
    readable: Readable,
    length: number | Uint8Array,
    onEof: "error" | "truncate" = "error",
): Promise<Uint8Array> {
    let res = typeof length === "number" ? u8.allocate(length) : length
    let remaining = res.length
    let pos = 0

    while (remaining > 0) {
        let read = await readable.read(res.subarray(pos, pos + remaining))
        if (read === 0) {
            if (onEof === "error") {
                throw new PartialReadError(res.subarray(0, pos), res.length)
            } else {
                return res.subarray(0, pos)
            }
        }
        remaining -= read
        pos += read
    }
    return res
}

export async function untilEnd(readable: Readable, chunkSize: number = 1024 * 16): Promise<Uint8Array> {
    let buf = Bytes.allocate(chunkSize)
    while (true) {
        let into = buf.writeSync(chunkSize)
        let read = await readable.read(into)
        buf.disposeWriteSync(read)
        if (read === 0) break
    }
    return buf.result()
}
