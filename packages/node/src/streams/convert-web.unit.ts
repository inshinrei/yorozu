import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PassThrough, Readable as NodeReadable } from "node:stream"
import { finished } from "node:stream/promises"

import { nodeReadableToWeb, nodeWritableToWeb, webReadableToNode, webWritableToNode } from "./convert-web"

let cleanup: Array<() => void> = []

describe("Node ↔ Web Streams Adapters", () => {
    beforeEach(() => {
        cleanup = []
    })

    afterEach(() => {
        cleanup.forEach((fn) => fn())
        cleanup = []
    })

    describe("nodeReadableToWeb", () => {
        it("streams data and respects back-pressure", async () => {
            let source = NodeReadable.from(Buffer.from("hello web"))
            let webStream = nodeReadableToWeb(source)

            let reader = webStream.getReader()
            let chunks: Uint8Array[] = []
            let result = await reader.read()
            while (!result.done) {
                chunks.push(result.value)
                result = await reader.read()
            }

            expect(Buffer.concat(chunks).toString()).toBe("hello web")
        })

        it("propagates errors", async () => {
            let source = new PassThrough()
            let webStream = nodeReadableToWeb(source)
            let boom = new Error("web boom")

            setImmediate(() => source.emit("error", boom))

            let reader = webStream.getReader()
            await expect(reader.read()).rejects.toThrow("web boom")
        })
    })

    describe.todo("nodeWritableToWeb", () => {
        it("writes data and closes cleanly", async () => {
            let dest = new PassThrough({ highWaterMark: 8 })
            let webStream = nodeWritableToWeb(dest)

            let writer = webStream.getWriter()
            let large = Buffer.alloc(100, "x")
            await writer.write(large)
            await writer.close()

            let collected = ""
            dest.on("data", (c) => (collected += c.toString()))
            dest.resume()

            await finished(dest)
            expect(collected.length).toBe(100)
        })

        it("propagates write errors", async () => {
            let dest = new PassThrough()
            let webStream = nodeWritableToWeb(dest)
            let boom = new Error("write web boom")

            setImmediate(() => dest.emit("error", boom))

            let writer = webStream.getWriter()
            await expect(writer.write(Buffer.from("data"))).rejects.toThrow("write web boom")
        })
    })

    describe("webReadableToNode", () => {
        it("converts ReadableStream → NodeReadable", async () => {
            let webStream = new ReadableStream({
                start(c) {
                    c.enqueue(Buffer.from("web → node"))
                    c.close()
                },
            })

            let nodeStream = webReadableToNode(webStream)
            let chunks: Buffer[] = []

            nodeStream.on("data", (chunk) => chunks.push(chunk))
            await finished(nodeStream)

            expect(Buffer.concat(chunks).toString()).toBe("web → node")
        })
    })

    describe("webWritableToNode", () => {
        it("forwards writes and final/close", async () => {
            let chunks: Uint8Array[] = []
            let closed = false

            let mockWeb = new WritableStream({
                write(chunk) {
                    chunks.push(chunk)
                    return Promise.resolve()
                },
                close() {
                    closed = true
                    return Promise.resolve()
                },
            })

            let node = webWritableToNode(mockWeb)

            node.write(Buffer.from("hello"))
            node.end()

            await finished(node)

            expect(chunks.length).toBe(1)
            expect(closed).toBe(true)
        })
    })
})
