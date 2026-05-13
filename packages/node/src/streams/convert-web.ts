import type * as streamWeb from "node:stream/web"
import { Readable as NodeReadable, Writable as NodeWritable } from "node:stream"
import { noop } from "@yorozu/utils"

export function nodeReadableToWeb(stream: NodeReadable): ReadableStream<Uint8Array> {
    if (import.meta.env?.MODE !== "test" && typeof NodeReadable.toWeb === "function") {
        return NodeReadable.toWeb(stream) as unknown as ReadableStream<Uint8Array>
    }

    stream.pause()

    return new ReadableStream({
        start(controller) {
            let ended = false

            let onReadable = () => {
                let chunk: Buffer | null
                while ((chunk = stream.read()) !== null) {
                    controller.enqueue(chunk)
                }
            }

            let onEnd = () => {
                ended = true
                controller.close()
            }

            let onError = (err: Error) => {
                if (!ended) controller.error(err)
            }

            stream.on("readable", onReadable)
            stream.on("end", onEnd)
            stream.on("error", onError)

            onReadable()

            return () => {
                stream.off("readable", onReadable)
                stream.off("end", onEnd)
                stream.off("error", onError)
            }
        },

        pull() {
            stream.resume()
        },

        cancel(reason) {
            stream.destroy(reason instanceof Error ? reason : undefined)
        },
    })
}

export function nodeWritableToWeb(writable: NodeWritable): WritableStream<Uint8Array> {
    if (import.meta.env?.MODE !== "test" && typeof NodeWritable.toWeb === "function") {
        return NodeWritable.toWeb(writable) as unknown as WritableStream<Uint8Array>
    }

    return new WritableStream({
        write(chunk) {
            return new Promise((resolve, reject) => {
                writable.write(chunk, (err) => {
                    if (err) reject(err)
                    else resolve()
                })
            })
        },

        close() {
            return new Promise((resolve, reject) => {
                writable.end((err: unknown) => {
                    err != null ? reject(err) : resolve()
                })
            })
        },

        abort(reason) {
            writable.destroy(reason instanceof Error ? reason : undefined)
        },
    })
}

export function webReadableToNode(stream: ReadableStream<Uint8Array>): NodeReadable {
    if (import.meta.env?.MODE !== "test" && typeof NodeReadable.fromWeb === "function") {
        return NodeReadable.fromWeb(
            stream as unknown as streamWeb.ReadableStream<Uint8Array>,
        ) as unknown as NodeReadable
    }

    let reader = stream.getReader()
    let ended = false

    let readable = new NodeReadable({
        async read() {
            try {
                let { done, value } = await reader.read()
                if (done) {
                    this.push(null)
                } else if (value) {
                    this.push(Buffer.from(value))
                }
            } catch (err) {
                this.destroy(err as Error)
            }
        },

        destroy(error, callback) {
            if (!ended) {
                void reader
                    .cancel(error)
                    .catch(noop)
                    .then(() => callback(error))
                return
            }
            callback(error)
        },
    })

    reader.closed
        .then(() => {
            ended = true
        })
        .catch((err) => readable.destroy(err as Error))

    return readable
}

export function webWritableToNode(writable: WritableStream<Uint8Array>): NodeWritable {
    if (import.meta.env?.MODE !== "test" && typeof NodeWritable.fromWeb === "function") {
        return NodeWritable.fromWeb(writable)
    }

    let writer = writable.getWriter()

    return new NodeWritable({
        write(chunk, _encoding, callback) {
            writer
                .write(chunk as Uint8Array)
                .then(() => callback())
                .catch(callback)
        },

        final(callback) {
            writer
                .close()
                .then(() => callback())
                .catch(callback)
        },
    })
}
