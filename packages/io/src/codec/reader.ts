import { Readable } from "../types"
import { FrameDecoder } from "./types"
import { Bytes } from "../bytes"

export interface FramedReaderOptions {
    initialBufferSize?: number
    readChinkSize?: number
}

export class FramedReader<Frame> {
    protected _readable: Readable
    protected _decoder: FrameDecoder<Frame>
    protected _buffer: Bytes

    protected _readChunkSize: number
    protected _eof = false
    protected _canDecode = false

    constructor(readable: Readable, decoder: FrameDecoder<Frame>, options?: FramedReaderOptions) {
        this._readable = readable
        this._decoder = decoder
        this._buffer = Bytes.allocate(options?.initialBufferSize ?? 1024 * 16)
        this._readChunkSize = options?.readChinkSize ?? 1024 * 16
    }

    async read(): Promise<Frame | null> {
        while (true) {
            if (this._canDecode) {
                let frame = await this._decoder.decode(this._buffer, this._eof)
                this._buffer.reclaim()

                if (frame !== null) return frame
            }

            if (this._eof) return null
            let into = this._buffer.writeSync(this._readChunkSize)
            let read = await this._readable.read(into)
            this._buffer.disposeWriteSync(read)
            if (read === 0) this._eof = true
            else this._canDecode = true
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<Frame> {
        return {
            next: async () => {
                let res = await this.read()
                if (res === null) return { done: true, value: undefined }
                return { done: false, value: res }
            },
        }
    }
}
