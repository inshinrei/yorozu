import { Readable } from "./types"

export interface ReaderWithFinalResult {
    readonly nread: number
    readonly final: boolean
}

export class ReaderWithFinal implements Readable {
    #buf1: Uint8Array
    #buf2: Uint8Array

    #readable: Readable
    #prev: Uint8Array | null = null
    #ended = false

    constructor(readable: Readable, options?: { internalBufferSize?: number }) {
        this.#readable = readable
        let bufSize = options?.internalBufferSize ?? 1024 * 32
        this.#buf1 = new Uint8Array(bufSize)
        this.#buf2 = new Uint8Array(bufSize)
    }

    async readWithFinal(into: Uint8Array): Promise<ReaderWithFinalResult> {
        if (this.#ended) return { nread: 0, final: true }
        if (!this.#prev) {
            let nread = await this.#readable.read(this.#buf1)
            if (nread === 0) return { nread: 0, final: true }
            this.#prev = this.#buf1.subarray(0, nread)
            this.#swapBufs()
        }

        if (this.#prev.length > into.length) {
            into.set(this.#prev.subarray(0, into.length))
            this.#prev = this.#prev.subarray(into.length)
            return { nread: into.length, final: false }
        }

        let nread = await this.#readable.read(this.#buf1)
        if (nread === 0) {
            into.set(this.#prev)
            this.#ended = true
            return { nread: this.#prev.length, final: true }
        }

        into.set(this.#prev)
        let nwritten = this.#prev.length
        this.#prev = this.#buf1.subarray(0, nread)
        this.#swapBufs()
        return { nread: nwritten, final: false }
    }

    async read(into: Uint8Array): Promise<number> {
        let res = await this.readWithFinal(into)
        return res.nread
    }

    #swapBufs(): void {
        let tmp = this.#buf1
        this.#buf1 = this.#buf2
        this.#buf2 = tmp
    }
}
