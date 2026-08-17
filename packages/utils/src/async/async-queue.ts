import { Deque } from "../structures"
import { Deferred } from "./deferred"

export class AsyncQueue<T> {
    readonly queue: Deque<T>
    readonly maxSize: number | undefined

    protected _consumerWaiters: Deque<Deferred<T | undefined>> = new Deque<Deferred<T | undefined>>()
    protected _producerWaiters: Deque<Deferred<void>> = new Deque<Deferred<void>>()
    protected _ended = false

    constructor(from?: ArrayLike<T> | Deque<T>, maxSize?: number) {
        if (maxSize !== undefined && maxSize < 1) {
            throw new Error("maxSize must be at least 1")
        }

        this.maxSize = maxSize

        if (from) {
            if (from instanceof Deque) {
                this.queue = from
            } else {
                this.queue = new Deque<T>(from)
            }
        } else {
            this.queue = new Deque<T>()
        }

        if (maxSize !== undefined && this.queue.length > maxSize) {
            throw new Error("Initial queue length exceeds maxSize")
        }
    }

    get length(): number {
        return this.queue.length
    }

    get isFull(): boolean {
        return this.maxSize !== undefined && this.queue.length >= this.maxSize
    }

    get remainingCapacity(): number {
        return this.maxSize !== undefined ? this.maxSize - this.queue.length : Infinity
    }

    get ended(): boolean {
        return this._ended
    }

    async enqueue(item: T): Promise<void> {
        if (this._ended) {
            throw new Error("Cannot enqueue after .end() has been called")
        }

        while (true) {
            if (this._consumerWaiters.length > 0) {
                let waiter = this._consumerWaiters.popFront()!
                waiter.resolve(item)
                return
            }

            if (!this.isFull) {
                this.queue.pushBack(item)
                return
            }

            let waiter = new Deferred<void>()
            this._producerWaiters.pushBack(waiter)
            await waiter.promise

            if (this._ended) {
                throw new Error("Queue was ended while waiting to enqueue.")
            }
        }
    }

    tryEnqueue(item: T): boolean {
        if (this._ended || this.isFull) {
            return false
        }
        if (this._consumerWaiters.length > 0) {
            let waiter = this._consumerWaiters.popFront()!
            waiter.resolve(item)
            return true
        }
        this.queue.pushBack(item)
        return true
    }

    end(): void {
        if (this._ended) throw new Error(".end() has already been called.")
        this._ended = true

        for (let waiter of this._consumerWaiters) {
            waiter.resolve(undefined)
        }
        this._consumerWaiters.clear()

        let err = new Error("Queue has been ended.")
        for (let waiter of this._producerWaiters) {
            waiter.reject(err)
        }
        this._producerWaiters.clear()
    }

    peek(): T | undefined {
        return this.queue.peekFront()
    }

    next(): T | undefined {
        if (this.queue.length === 0) return undefined
        let item = this.queue.popFront()
        this._wakeProducerIfNeeded()
        return item
    }

    async nextOrWait(): Promise<T | undefined> {
        if (this.queue.length > 0) {
            let item = this.queue.popFront()
            this._wakeProducerIfNeeded()
            return item
        }
        if (this._ended) {
            return undefined
        }

        let waiter = new Deferred<T | undefined>()
        this._consumerWaiters.pushBack(waiter)
        return waiter.promise
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        let iterator: AsyncIterableIterator<T> = {
            [Symbol.asyncIterator]: () => iterator,
            next: async () => {
                let item = await this.nextOrWait()
                if (item === undefined) return { done: true, value: undefined }
                return { value: item, done: false }
            },
        }
        return iterator
    }

    protected _wakeProducerIfNeeded(): void {
        if (this._producerWaiters.length > 0 && !this.isFull) {
            let producer = this._producerWaiters.popFront()!
            producer.resolve()
        }
    }
}
