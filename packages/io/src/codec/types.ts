import { Bytes } from "../bytes"
import { MaybePromise, NoneToVoidFunction } from "@yorozu/utils"
import { SyncWritable } from "../types"

export interface FrameDecoder<Frame = Uint8Array> {
    decode: (buf: Bytes, eof: boolean) => MaybePromise<Frame | null>
}

export interface FrameEncoder<Frame = Uint8Array> {
    encode: (frame: Frame, into: SyncWritable) => MaybePromise<void>
    reset: NoneToVoidFunction
}
