import { Readable } from "./types"
import { u8 } from "@yorozu/utils"

const DefaultBufSize = 4096
const MinBufSize = 16

export class BufReader implements Readable {
    protected _buffer: Uint8Array
    protected _readable: Readable
    protected _readPos = 0
    protected _writePos = 0
    protected _eof = false

    constructor(readable: Readable, size: number = DefaultBufSize) {
        if (size < MinBufSize) {
            size = MinBufSize
        }
        this._buffer = u8.allocate(size)
        this._readable = readable
    }

    get bufferSize(): number {
        return this._buffer.byteLength
    }

    get buffered(): number {
        return this._writePos - this._readPos
    }

    async read(into: Uint8Array): Promise<number> {
        if (this._eof) return 0

        if (this._readPos === this._writePos) {
            if (into.byteLength >= this._buffer.byteLength) return this._readable.read(into)
            await this._fill()
        }

        let sliceSize = Math.min(this._writePos - this._readPos, into.byteLength)
        into.set(this._buffer.subarray(this._readPos, this._readPos + sliceSize))
        this._readPos += sliceSize
        return sliceSize
    }

    protected async _fill(): Promise<void> {
        if (this._readPos > 0) {
            this._buffer.copyWithin(0, this._readPos, this._writePos)
            this._writePos -= this._readPos
            this._readPos = 0
        }

        if (this._writePos >= this._buffer.byteLength) {
            throw new Error("Tried to fill full buffer.")
        }

        const read = await this._readable.read(this._buffer.subarray(this._writePos))
        if (read === 0) {
            this._eof = true
            return
        }

        this._writePos += read
    }
}
