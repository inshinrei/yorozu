import { empty } from "./misc"

export class BufferPool {
    readonly size: number
    readonly maxAllocSize: number

    protected _pool!: ArrayBuffer
    protected _offset: number = 0

    constructor(size: number = 16 * 1024) {
        this.size = size
        this.maxAllocSize = size >>> 1
        this._reallocate()
    }

    protected get _remaining(): number {
        return this.size - this._offset
    }

    allocate(size: number): Uint8Array {
        if (!Number.isInteger(size) || size < 0) throw new RangeError(`Invalid allocation size: ${size}.`)
        if (size === 0) return empty
        if (size > this.maxAllocSize) {
            return new Uint8Array(size)
        }

        if (size > this._remaining) {
            this._reallocate()
        }

        let start = this._offset
        this._offset += size
        this._align()

        return new Uint8Array(this._pool, start, size)
    }

    reset(): void {
        this._reallocate()
    }

    protected _reallocate(): void {
        this._pool = new ArrayBuffer(this.size)
        this._offset = 0
    }

    protected _align(): void {
        let misalignment = this._offset & 0x7
        if (misalignment !== 0) {
            this._offset += 8 - misalignment
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
