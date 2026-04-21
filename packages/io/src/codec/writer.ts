import { Writable } from "../types"
import { FrameEncoder } from "./types"
import { Bytes } from "../bytes"
import { u8 } from "@yorozu/utils"

export interface FramedWriterOptions {
    initialBufferSize?: number
}

export class FramedWriter<Frame = Uint8Array> {
    #writable: Writable
    #encoder: FrameEncoder<Frame>
    #buffer: Bytes
    #highWaterMark: number

    constructor(writable: Writable, encoder: FrameEncoder<Frame>, options?: FramedWriterOptions) {
        this.#writable = writable
        this.#encoder = encoder
        this.#highWaterMark = options?.initialBufferSize ?? 1024
        this.#buffer = Bytes.allocate(this.#highWaterMark)
    }

    async write(frame: Frame): Promise<void> {
        await this.#encoder.encode(frame, this.#buffer)
        let buffer = this.#buffer.result()
        if (buffer.length > 0) {
            let copy = u8.allocateWith(buffer)
            this.#buffer.reset()
            await this.#writable.write(copy)
        }
    }
}
