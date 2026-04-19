import { empty } from "./misc"

export class BufferPool {
    readonly size: number
    readonly maxAllocSize: number

    #pool!: ArrayBuffer
    #offset: number = 0

    constructor(size: number = 16 * 1024) {
        this.size = size
        this.maxAllocSize = size >>> 1
        this.#reallocate()
    }

    get #remaining(): number {
        return this.size - this.#offset
    }

    allocate(size: number): Uint8Array {
        if (size === 0) return empty
        if (size > this.maxAllocSize) {
            return new Uint8Array(size)
        }

        if (size > this.#remaining) {
            this.#reallocate()
        }

        let start = this.#offset
        this.#offset += size
        this.#align()

        return new Uint8Array(this.#pool, start, size)
    }

    reset(): void {
        this.#reallocate()
    }

    #reallocate(): void {
        this.#pool = new ArrayBuffer(this.size)
        this.#offset = 0
    }

    #align(): void {
        let misalignment = this.#offset & 0x7
        if (misalignment !== 0) {
            this.#offset += 8 - misalignment
        }
    }
}

let defaultPool = new BufferPool(16 * 1024)

export function setDefaultPool(size: number): void {
    defaultPool = new BufferPool(size)
}

export function allocate(size: number): Uint8Array {
    return defaultPool.allocate(size)
}

export function allocateWith(init: ArrayLike<number>): Uint8Array {
    let buf = allocate(init.length)
    buf.set(init)
    return buf
}
