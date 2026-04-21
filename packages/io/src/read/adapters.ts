import { Closable, Readable, SyncReadable } from "../types"
import { isByobCapableStream } from "../streams"
import { noop } from "@yorozu/utils"
import { Bytes } from "../bytes"

export function yoroSyncReadableToAsync(readable: SyncReadable): Readable {
    return {
        async read(into: Uint8Array): Promise<number> {
            let buf = readable.readSync(into.length)
            into.set(buf)
            return buf.length
        },
    }
}

export function webReadableToYoro(readable: ReadableStream<Uint8Array>): Readable & Closable {
    if (isByobCapableStream(readable)) {
        let reader = readable.getReader({ mode: "byob" })
        return {
            async read(into: Uint8Array): Promise<number> {
                let temp = new Uint8Array(into.length)
                let { value, done } = await reader.read(temp)
                if (done) return 0
                into.set(value!)
                return value!.byteLength
            },
            close() {
                reader.cancel().catch(noop)
            },
        }
    }

    let reader = readable.getReader()
    let buf = Bytes.allocate()
    return {
        async read(into: Uint8Array): Promise<number> {
            if (buf.available === 0) {
                let { value, done } = await reader.read()
                if (done) return 0
                buf.writeSync(value!.byteLength).set(value!)
                buf.disposeWriteSync()
            }
            let read = Math.min(into.length, buf.available)
            into.set(buf.readSync(read), 0)
            buf.reclaim()
            return read
        },
        close() {
            reader.cancel().catch(noop)
        },
    }
}

export function yoroReadableToWeb(readable: Readable): ReadableStream<Uint8Array> {
    return new ReadableStream({
        type: "bytes",
        async pull(controller) {
            if (controller.byobRequest) {
                if (!controller.byobRequest.view) {
                    controller.byobRequest.respond(0)
                    return
                }
                let { view: v } = controller.byobRequest
                let view = new Uint8Array(v.buffer, v.byteOffset, v?.byteLength)
                let nread = await readable.read(view)
                if (nread === 0) {
                    controller.close()
                    controller.byobRequest.respond(0)
                    return
                }
                controller.byobRequest.respond(nread)
                return
            }
            let buf = new Uint8Array(1024 * 32)
            let nread = 0
            while (nread === 0) {
                nread = await readable.read(buf)
                if (nread === 0) break
                controller.enqueue(buf.subarray(0, nread))
            }

            if (nread === 0) controller.close()
        },
    })
}
