import { Readable } from "./types"

export interface ReaderWithFinalResult {
    readonly nread: number
    readonly final: boolean
}

export class ReaderWithFinal implements Readable {
    protected _buf1: Uint8Array
    protected _buf2: Uint8Array

    protected _readable: Readable
    protected _prev: Uint8Array | null = null
    protected _ended = false

    constructor(readable: Readable, options?: { internalBufferSize?: number }) {
        this._readable = readable
        let bufSize = options?.internalBufferSize ?? 1024 * 32
        this._buf1 = new Uint8Array(bufSize)
        this._buf2 = new Uint8Array(bufSize)
    }

    async readWithFinal(into: Uint8Array): Promise<ReaderWithFinalResult> {
        if (this._ended) return { nread: 0, final: true }
        if (!this._prev) {
            let nread = await this._readable.read(this._buf1)
            if (nread === 0) return { nread: 0, final: true }
            this._prev = this._buf1.subarray(0, nread)
            this._swapBufs()
        }

        if (this._prev.length > into.length) {
            into.set(this._prev.subarray(0, into.length))
            this._prev = this._prev.subarray(into.length)
            return { nread: into.length, final: false }
        }

        let nread = await this._readable.read(this._buf1)
        if (nread === 0) {
            into.set(this._prev)
            this._ended = true
            return { nread: this._prev.length, final: true }
        }

        into.set(this._prev)
        let nwritten = this._prev.length
        this._prev = this._buf1.subarray(0, nread)
        this._swapBufs()
        return { nread: nwritten, final: false }
    }

    async read(into: Uint8Array): Promise<number> {
        let res = await this.readWithFinal(into)
        return res.nread
    }

    protected _swapBufs(): void {
        let tmp = this._buf1
        this._buf1 = this._buf2
        this._buf2 = tmp
    }
}
