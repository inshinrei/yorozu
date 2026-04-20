import { Readable } from "./types"
import { u8 } from "@yorozu/utils"

const DefaultBufSize = 4096
const MinBufSize = 16

export class BufReader implements Readable {
    #buffer: Uint8Array
    #readable: Readable
    #readPos = 0
    #writePos = 0
    #eof = false

    constructor(readable: Readable, size: number = DefaultBufSize) {
        if (size < MinBufSize) {
            size = MinBufSize
        }
        this.#buffer = u8.allocate(size)
        this.#readable = readable
    }

    get bufferSize(): number {
        return this.#buffer.byteLength
    }

    get buffered(): number {
        return this.#writePos - this.#readPos
    }

    async read(into: Uint8Array): Promise<number> {
        if (this.#eof) return 0

        if (this.#readPos === this.#writePos) {
            if (into.byteLength >= this.#buffer.byteLength) return this.#readable.read(into)
            await this.#fill()
        }

        let sliceSize = Math.min(this.#writePos - this.#readPos, into.byteLength)
        into.set(this.#buffer.subarray(this.#readPos, this.#readPos + sliceSize))
        this.#readPos += sliceSize
        return sliceSize
    }

    async #fill() {
        if (this.#readPos > 0) {
            this.#buffer.copyWithin(0, this.#readPos, this.#writePos)
            this.#writePos -= this.#readPos
            this.#readPos = 0
        }

        if (this.#writePos >= this.#buffer.byteLength) {
            throw new Error("Tried to fill full buffer.")
        }

        const read = await this.#readable.read(this.#buffer.subarray(this.#writePos))
        if (read === 0) {
            this.#eof = true
            return
        }

        this.#writePos += read
    }
}
