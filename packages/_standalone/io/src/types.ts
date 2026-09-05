import { NoneToVoidFunction } from "@yorozu/utils"

export interface SyncReadable {
    readSync: (bytes: number) => Uint8Array
}

export interface Readable {
    read: (into: Uint8Array) => Promise<number>
}

export interface Closable {
    close: NoneToVoidFunction
}

export interface SyncWritable {
    writeSync: (bytes: number) => Uint8Array
    disposeWriteSync: (written?: number) => void
}

export interface Writable {
    write: (bytes: Uint8Array) => Promise<void>
}
