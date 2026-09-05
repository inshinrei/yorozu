import { Closable, SyncWritable, Writable } from "../types"
import { noop } from "@yorozu/utils"

export function yoroSyncWritableToAsync(sync: SyncWritable): Writable {
    return {
        async write(bytes: Uint8Array) {
            let buffer = sync.writeSync(bytes.length)
            buffer.set(bytes)
            sync.disposeWriteSync()
        },
    }
}

export function webWritableToYoro(writable: WritableStream<Uint8Array>): Writable & Closable {
    let writer = writable.getWriter()
    return {
        async write(bytes: Uint8Array) {
            await writer.write(bytes)
        },
        close() {
            writer.close().catch(noop)
        },
    }
}

export function yoroWritableToWeb(writable: Writable): WritableStream<Uint8Array> {
    return new WritableStream({
        async write(chunk) {
            await writable.write(chunk)
        },
        close() {
            if ("close" in writable) (writable as Closable).close()
        },
    })
}
