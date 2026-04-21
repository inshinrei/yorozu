import { Readable, SyncReadable, SyncWritable, Writable } from "./types"
import { u8 } from "@yorozu/utils"
import { nextPowerOfTwo } from "./_utils"

export class Bytes implements Readable, Writable, SyncReadable, SyncWritable {
    #buffer: Uint8Array
    #writePos = 0
    #readPos = 0
    #preferredCapacity: number
    #sharedRead = new Uint8Array(1)
    #lastWriteSize = 0

    constructor(buf: Uint8Array) {
        this.#buffer = buf
        this.#preferredCapacity = buf.length
    }

    get capacity(): number {
        return this.#buffer.byteLength
    }

    get available(): number {
        return this.#writePos - this.#readPos
    }

    get written(): number {
        return this.#writePos
    }

    static allocate(capacity: number = 1024 * 16): Bytes {
        return new Bytes(u8.allocate(capacity))
    }

    static from(data: Uint8Array): Bytes {
        let bytes = new Bytes(data)
        bytes.#writePos = data.length
        return bytes
    }

    readSync(bytes: number): Uint8Array {
        if (this.#readPos >= this.#writePos) return u8.empty
        if (bytes === 1) {
            this.#sharedRead[0] = this.#buffer[this.#readPos++]
            return this.#sharedRead
        }
        let end = Math.min(this.#writePos, this.#readPos + bytes)
        let result = this.#buffer.subarray(this.#readPos, end)
        this.#readPos = end
        return result
    }

    async read(into: Uint8Array): Promise<number> {
        let size = Math.min(into.length, this.#writePos - this.#readPos)
        into.set(this.#buffer.subarray(this.#readPos, this.#readPos + size))
        this.#readPos += size
        return size
    }

    writeSync(size: number): Uint8Array {
        this.#lastWriteSize = size
        let newPos = this.#writePos + size
        if (newPos > this.#buffer.length) {
            let newBuffer = u8.allocate(nextPowerOfTwo(newPos))
            newBuffer.set(this.#buffer)
            this.#buffer = newBuffer
        }
        let slice = this.#buffer.subarray(this.#writePos, newPos)
        this.#writePos = newPos
        return slice
    }

    disposeWriteSync(written?: number): void {
        if (written !== undefined) {
            if (written > this.#lastWriteSize)
                throw new RangeError(`Written exceed last write size: ${written} > ${this.#lastWriteSize}`)
            this.#writePos -= this.#lastWriteSize - written
        }
    }

    async write(bytes: Uint8Array): Promise<void> {
        this.writeSync(bytes.length).set(bytes)
        this.disposeWriteSync()
    }

    result(): Uint8Array {
        return this.#buffer.subarray(this.#readPos, this.#writePos)
    }

    reclaim(): void {
        if (this.#readPos === 0) return
        let remaining = this.#writePos - this.#readPos
        if (remaining > 0) {
            if (remaining < this.#preferredCapacity && this.capacity > this.#preferredCapacity) {
                let newBuffer = u8.allocate(this.#preferredCapacity)
                newBuffer.set(this.#buffer.subarray(this.#readPos, this.#writePos))
                this.#buffer = newBuffer
            } else {
                this.#buffer.copyWithin(0, this.#readPos, this.#writePos)
            }
        }
        this.#writePos = remaining
        this.#readPos = 0
    }

    rewind(n: number): void {
        if (n > this.#readPos) throw new RangeError(`Rewind ${n} > ${this.#readPos}.`)
        this.#readPos -= n
    }

    reset(): void {
        this.#readPos = 0
        this.#writePos = 0
    }
}
