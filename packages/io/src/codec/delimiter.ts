import type { FrameDecoder, FrameEncoder } from "./types"
import { Bytes } from "../bytes"
import { typed } from "@yorozu/utils"
import { SyncWritable } from "../types"

export interface DelimiterCodecOptions {
    strategy?: "keep" | "discard"
}

export class DelimiterCodec implements FrameDecoder, FrameEncoder {
    #strategy: DelimiterCodecOptions["strategy"]

    constructor(
        readonly delimiter: Uint8Array,
        readonly options?: DelimiterCodecOptions | undefined,
    ) {
        this.#strategy = options?.strategy ?? "discard"
    }

    decode(buf: Bytes, eof: boolean): Uint8Array | null {
        let { delimiter } = this
        let data = buf.readSync(buf.available)
        if (eof && data.length === 0) return null
        let delimiterIdx = typed.indexOfArray(data, delimiter)
        if (delimiterIdx === -1) {
            if (eof) return data
            buf.rewind(data.length)
            return null
        }
        buf.rewind(data.length - delimiterIdx - delimiter.length)
        let frameEnd = this.#strategy === "keep" ? delimiterIdx + delimiter.length : delimiterIdx
        return data.slice(0, frameEnd)
    }

    encode(data: Uint8Array, into: SyncWritable): void {
        let buf = into.writeSync(data.length + this.delimiter.length)
        buf.set(data)
        buf.set(this.delimiter, data.length)
        into.disposeWriteSync()
    }

    reset(): void {}
}
