import { Readable } from "../types"
import { FrameDecoder } from "./types"
import { Bytes } from "../bytes"

export interface FramedReaderOptions {
    initialBufferSize?: number
    readChinkSize?: number
}

export class FramedReader<Frame> {
    #readable: Readable
    #decoder: FrameDecoder<Frame>
    #buffer: Bytes

    #readChunkSize: number
    #eof = false
    #canDecode = false

    constructor(readable: Readable, decoder: FrameDecoder<Frame>, options?: FramedReaderOptions) {
        this.#readable = readable
        this.#decoder = decoder
        this.#buffer = Bytes.allocate(options?.initialBufferSize ?? 1024 * 16)
        this.#readChunkSize = options?.readChinkSize ?? 1024 * 16
    }

    async read(): Promise<Frame | null> {
        while (true) {
            if (this.#canDecode) {
                let frame = await this.#decoder.decode(this.#buffer, this.#eof)
                this.#buffer.reclaim()

                if (frame !== null) return frame
            }

            if (this.#eof) return null
            let into = this.#buffer.writeSync(this.#readChunkSize)
            let read = await this.#readable.read(into)
            this.#buffer.disposeWriteSync(read)
            if (read === 0) this.#eof = true
            else this.#canDecode = true
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
