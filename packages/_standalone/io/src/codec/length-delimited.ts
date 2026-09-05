import { Bytes } from "../bytes"
import { SyncWritable } from "../types"
import { FrameDecoder, FrameEncoder } from "./types"
import { u8 } from "@yorozu/utils"

export interface LengthDelimitedCodecOptions {
    read?: (r: Bytes) => number | null
    write?: (w: SyncWritable, n: number) => void
}

export class LengthDelimitedCodec implements FrameDecoder, FrameEncoder {
    protected _read: LengthDelimitedCodecOptions["read"]
    protected _write: LengthDelimitedCodecOptions["write"]
    protected _pendingLength: number | null = null

    constructor(options: LengthDelimitedCodecOptions) {
        this._read = options.read
        this._write = options.write
    }

    decode(buf: Bytes): Uint8Array | null {
        if (!this._read) throw new Error(`Read function not provided.`)
        if (this._pendingLength !== null) {
            let pendingLength = this._pendingLength
            if (buf.available < pendingLength) return null
            let data = buf.readSync(pendingLength)
            this._pendingLength = null
            return u8.allocateWith(data)
        }
        let length = this._read(buf)
        if (length === null) return null
        this._pendingLength = length
        return this.decode(buf)
    }

    encode(frame: Uint8Array, into: SyncWritable): void {
        if (!this._write) throw new Error(`Write function not provided.`)
        this._write(into, frame.length)
        into.writeSync(frame.length).set(frame)
        into.disposeWriteSync()
    }

    reset(): void {
        this._pendingLength = null
    }
}
