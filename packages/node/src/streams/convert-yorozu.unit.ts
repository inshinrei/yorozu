import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PassThrough, Readable as NodeReadable } from "node:stream"
import { finished } from "node:stream/promises"
import { type Closable, type Writable } from "@yorozu/io"

import { nodeReadableToYoro, nodeWritableToYoro, yoroWritableToNode } from "./convert-yorozu"

let cleanup: Array<() => void> = []

describe("Stream Adapters", () => {
    beforeEach(() => {
        cleanup = []
    })

    afterEach(() => {
        cleanup.forEach((fn) => fn())
        cleanup = []
    })

    describe("nodeReadableToYoro", () => {
        it("reads data with internal buffering and signals EOF", async () => {
            let source = NodeReadable.from(Buffer.from("hello world"))
            let yoro = nodeReadableToYoro(source)

            let buf = new Uint8Array(5)
            let n = await yoro.read(buf)
            expect(n).toBe(5)
            expect(new TextDecoder().decode(buf.slice(0, n))).toBe("hello")

            buf = new Uint8Array(10)
            n = await yoro.read(buf)
            expect(n).toBe(6)
            expect(new TextDecoder().decode(buf.slice(0, n))).toBe(" world")

            n = await yoro.read(new Uint8Array(10))
            expect(n).toBe(0)
        })

        it("propagates errors from Node readable", async () => {
            let source = new PassThrough()
            let yoro = nodeReadableToYoro(source)
            let boom = new Error("stream boom")

            setImmediate(() => source.emit("error", boom))

            let buf = new Uint8Array(10)
            await expect(yoro.read(buf)).rejects.toThrow("stream boom")
        })

        it("close destroys the underlying Node stream", () => {
            let source: any = new PassThrough()
            let destroyed = false
            source.destroy = vi.fn(() => {
                destroyed = true
            })
            let yoro = nodeReadableToYoro(source)

            yoro.close()
            expect(destroyed).toBe(true)
        })
    })

    describe("nodeWritableToYoro", () => {
        it("close ends the Node writable", async () => {
            let dest: any = new PassThrough()
            let ended = false
            dest.end = vi.fn(() => {
                ended = true
            })
            let yoro = nodeWritableToYoro(dest)

            yoro.close()
            expect(ended).toBe(true)
        })
    })

    describe("yoroWritableToNode", () => {
        it("forwards writes and final/close to yoro writable", async () => {
            let chunks: Uint8Array[] = []
            let closed = false

            let mockYoro: Writable & Closable = {
                write: async (bytes: Uint8Array) => {
                    chunks.push(bytes)
                },
                close: async () => {
                    closed = true
                },
            }

            let node = yoroWritableToNode(mockYoro)

            let data = Buffer.from("yoro → node")
            node.write(data)
            node.end()

            await finished(node)

            expect(chunks.length).toBe(1)
            expect(chunks[0]).toEqual(data)
            expect(closed).toBe(true)
        })
    })
})
