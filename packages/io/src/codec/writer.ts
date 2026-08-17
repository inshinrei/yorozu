import { Writable } from "../types"
import { FrameEncoder } from "./types"
import { Bytes } from "../bytes"
import { u8 } from "@yorozu/utils"

export interface FramedWriterOptions {
    initialBufferSize?: number
}

export class FramedWriter<Frame = Uint8Array> {
    protected _writable: Writable
    protected _encoder: FrameEncoder<Frame>
    protected _buffer: Bytes
    protected _highWaterMark: number

    constructor(writable: Writable, encoder: FrameEncoder<Frame>, options?: FramedWriterOptions) {
        this._writable = writable
        this._encoder = encoder
        this._highWaterMark = options?.initialBufferSize ?? 1024
        this._buffer = Bytes.allocate(this._highWaterMark)
    }

    async write(frame: Frame): Promise<void> {
        await this._encoder.encode(frame, this._buffer)
        let buffer = this._buffer.result()
        if (buffer.length > 0) {
            let copy = u8.allocateWith(buffer)
            this._buffer.reset()
            await this._writable.write(copy)
        }
    }
}
