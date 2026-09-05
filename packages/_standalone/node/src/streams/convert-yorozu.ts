import { Bytes, Closable, Readable, Writable } from "@yorozu/io"
import { Deferred } from "@yorozu/utils"
import { Readable as NodeReadable, Writable as NodeWritable } from "node:stream"

export function nodeReadableToYoro(stream: NodeReadable): Readable & Closable {
    let ended = false
    let error: Error | null = null
    let pending: Deferred<void> | null = null

    let readBuffer = Bytes.allocate()

    const resolvePending = () => {
        pending?.resolve()
        pending = null
    }

    const rejectPending = (err: Error) => {
        pending?.reject(err)
        pending = null
    }

    stream.on("readable", resolvePending)
    stream.on("end", () => {
        ended = true
        resolvePending()
    })
    stream.on("error", (err) => {
        error = err
        rejectPending(err)
    })

    return {
        async read(into: Uint8Array): Promise<number> {
            if (error) throw error
            if (ended && readBuffer.available === 0) return 0

            if (readBuffer.available > 0) {
                let size = Math.min(readBuffer.available, into.length)
                into.set(readBuffer.readSync(size))
                return size
            }

            let chunk: Buffer | null = stream.read(into.length)

            if (chunk !== null) {
                if (chunk.length > into.length) {
                    let excess = chunk.length - into.length
                    readBuffer.writeSync(excess).set(chunk.subarray(into.length))
                    chunk = chunk.subarray(0, into.length)
                }
                into.set(chunk)
                return chunk.length
            }

            if (ended) return 0

            pending = new Deferred<void>()
            await pending.promise

            return this.read(into) // retry once data arrives
        },

        close() {
            stream.destroy()
        },
    }
}

export function nodeWritableToYoro(writable: NodeWritable): Writable & Closable {
    let ended = false
    let error: Error | null = null
    let pending: Deferred<void> | null = null

    const resolvePending = () => {
        pending?.resolve()
        pending = null
    }

    const rejectPending = (err: Error) => {
        pending?.reject(err)
        pending = null
    }

    writable.on("finish", () => {
        ended = true
        resolvePending()
    })

    writable.on("drain", resolvePending)
    writable.on("error", (err) => {
        error = err
        rejectPending(err)
    })

    return {
        async write(bytes: Uint8Array): Promise<void> {
            if (ended) return
            if (error) throw error

            if (pending) {
                await pending.promise
                if (error) throw error
            }

            const ok = writable.write(bytes)
            if (!ok) {
                pending = new Deferred<void>()
            }
        },

        close() {
            if (!ended) {
                ended = true
                writable.end()
            }
        },
    }
}

export function yoroWritableToNode(writable: Writable): NodeWritable {
    return new NodeWritable({
        async write(chunk: any, _encoding: string, callback: (err?: Error | null) => void) {
            try {
                await writable.write(chunk as Uint8Array)
                callback()
            } catch (err) {
                callback(err as Error)
            }
        },

        async final(callback: (err?: Error | null) => void) {
            try {
                if ("close" in writable) {
                    await (writable as Closable).close()
                }
                callback()
            } catch (err) {
                callback(err as Error)
            }
        },
    })
}
