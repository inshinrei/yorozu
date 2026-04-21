import { Bytes } from "../bytes"
import { SyncWritable } from "../types"
import { FrameDecoder, FrameEncoder } from "./types"
import { u8 } from "@yorozu/utils"

export interface LengthDelimitedCodecOptions {
    read?: (r: Bytes) => number | null
    write?: (w: SyncWritable, n: number) => void
}

export class LengthDelimitedCodec implements FrameDecoder, FrameEncoder {
    #read: LengthDelimitedCodecOptions["read"]
    #write: LengthDelimitedCodecOptions["write"]
    #pendingLength: number | null = null

    constructor(options: LengthDelimitedCodecOptions) {
        this.#read = options.read
        this.#write = options.write
    }

    decode(buf: Bytes): Uint8Array | null {
        if (!this.#read) throw new Error(`Read function not provided.`)
        if (this.#pendingLength !== null) {
            let pendingLength = this.#pendingLength
            if (buf.available < pendingLength) return null
            let data = buf.readSync(pendingLength)
            this.#pendingLength = null
            return u8.allocateWith(data)
        }
        let length = this.#read(buf)
        if (length === null) return null
        this.#pendingLength = length
        return this.decode(buf)
    }

    encode(frame: Uint8Array, into: SyncWritable): void {
        if (!this.#write) throw new Error(`Write function not provided.`)
        this.#write(into, frame.length)
        into.writeSync(frame.length).set(frame)
        into.disposeWriteSync()
    }

    reset(): void {
        this.#pendingLength = null
    }
}
