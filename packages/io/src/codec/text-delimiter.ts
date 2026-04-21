import { FrameDecoder, FrameEncoder } from "./types"
import { DelimiterCodec, DelimiterCodecOptions } from "./delimiter"
import { utf8 } from "@yorozu/utils"
import { Bytes } from "../bytes"
import { SyncWritable } from "../types"

export class TextDelimiterCodec implements FrameDecoder<string>, FrameEncoder<string> {
    #inner: DelimiterCodec

    constructor(delimiter: Uint8Array | string, options?: DelimiterCodecOptions) {
        if (typeof delimiter === "string") delimiter = utf8.encoder.encode(delimiter)
        this.#inner = new DelimiterCodec(delimiter, options)
    }

    decode(buf: Bytes, eof: boolean): string | null {
        let data = this.#inner.decode(buf, eof)
        return data === null ? null : utf8.decoder.decode(data)
    }

    encode(data: string, into: SyncWritable): void {
        this.#inner.encode(utf8.encoder.encode(data), into)
    }

    reset(): void {
        this.#inner.reset()
    }
}
