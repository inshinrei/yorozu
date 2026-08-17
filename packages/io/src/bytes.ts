import { Readable, SyncReadable, SyncWritable, Writable } from "./types"
import { u8 } from "@yorozu/utils"
import { nextPowerOfTwo } from "./_utils"

export class Bytes implements Readable, Writable, SyncReadable, SyncWritable {
    protected _buffer: Uint8Array
    protected _writePos = 0
    protected _readPos = 0
    protected _preferredCapacity: number
    protected _sharedRead: Uint8Array = new Uint8Array(1)
    protected _lastWriteSize = 0

    constructor(buf: Uint8Array) {
        this._buffer = buf
        this._preferredCapacity = buf.length
    }

    get capacity(): number {
        return this._buffer.byteLength
    }

    get available(): number {
        return this._writePos - this._readPos
    }

    get written(): number {
        return this._writePos
    }

    static allocate(capacity: number = 1024 * 16): Bytes {
        return new Bytes(u8.allocate(capacity))
    }

    static from(data: Uint8Array): Bytes {
        let bytes = new Bytes(data)
        bytes._writePos = data.length
        return bytes
    }

    readSync(bytes: number): Uint8Array {
        if (this._readPos >= this._writePos) return u8.empty
        if (bytes === 1) {
            this._sharedRead[0] = this._buffer[this._readPos++]
            return this._sharedRead
        }
        let end = Math.min(this._writePos, this._readPos + bytes)
        let result = this._buffer.subarray(this._readPos, end)
        this._readPos = end
        return result
    }

    async read(into: Uint8Array): Promise<number> {
        let size = Math.min(into.length, this._writePos - this._readPos)
        into.set(this._buffer.subarray(this._readPos, this._readPos + size))
        this._readPos += size
        return size
    }

    writeSync(size: number): Uint8Array {
        this._lastWriteSize = size
        let newPos = this._writePos + size
        if (newPos > this._buffer.length) {
            let newBuffer = u8.allocate(nextPowerOfTwo(newPos))
            newBuffer.set(this._buffer)
            this._buffer = newBuffer
        }
        let slice = this._buffer.subarray(this._writePos, newPos)
        this._writePos = newPos
        return slice
    }

    disposeWriteSync(written?: number): void {
        if (written !== undefined) {
            if (written > this._lastWriteSize)
                throw new RangeError(`Written exceed last write size: ${written} > ${this._lastWriteSize}`)
            this._writePos -= this._lastWriteSize - written
        }
    }

    async write(bytes: Uint8Array): Promise<void> {
        this.writeSync(bytes.length).set(bytes)
        this.disposeWriteSync()
    }

    result(): Uint8Array {
        return this._buffer.subarray(this._readPos, this._writePos)
    }

    reclaim(): void {
        if (this._readPos === 0) return
        let remaining = this._writePos - this._readPos
        if (remaining > 0) {
            if (remaining < this._preferredCapacity && this.capacity > this._preferredCapacity) {
                let newBuffer = u8.allocate(this._preferredCapacity)
                newBuffer.set(this._buffer.subarray(this._readPos, this._writePos))
                this._buffer = newBuffer
            } else {
                this._buffer.copyWithin(0, this._readPos, this._writePos)
            }
        }
        this._writePos = remaining
        this._readPos = 0
    }

    rewind(n: number): void {
        if (n > this._readPos) throw new RangeError(`Rewind ${n} > ${this._readPos}.`)
        this._readPos -= n
    }

    reset(): void {
        this._readPos = 0
        this._writePos = 0
    }
}
