import { Deque } from "../structures"
import { Deferred } from "./deferred"

type WaitResult<T> = {done: true} | {done: false; value: T}

export class AsyncQueue<T> {
    readonly queue: Deque<T>
    readonly maxSize: number | undefined

    protected _consumerWaiters: Deque<Deferred<WaitResult<T>>> = new Deque<Deferred<WaitResult<T>>>()
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
                waiter.resolve({done: false, value: item})
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
            waiter.resolve({done: false, value: item})
            return true
        }
        this.queue.pushBack(item)
        return true
    }

    end(): void {
        if (this._ended) throw new Error(".end() has already been called.")
        this._ended = true

        for (let waiter of this._consumerWaiters) {
            waiter.resolve({done: true})
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

        let result = await this._waitForItem()
        if (result.done) return undefined
        return result.value
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        let iterator: AsyncIterableIterator<T> = {
            [Symbol.asyncIterator]: () => iterator,
            next: async () => {
                if (this.queue.length > 0) {
                    return {value: this.next() as T, done: false}
                }
                if (this._ended) return {done: true, value: undefined}
                let result = await this._waitForItem()
                if (result.done) return {done: true, value: undefined}
                return {value: result.value, done: false}
            },
        }
        return iterator
    }

    protected _waitForItem(): Promise<WaitResult<T>> {
        let waiter = new Deferred<WaitResult<T>>()
        this._consumerWaiters.pushBack(waiter)
        return waiter.promise
    }

    protected _wakeProducerIfNeeded(): void {
        if (this._producerWaiters.length > 0 && !this.isFull) {
            let producer = this._producerWaiters.popFront()!
            producer.resolve()
        }
    }
}
