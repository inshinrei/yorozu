import { Deque } from "../structures"
import { Deferred } from "./deferred"

export class AsyncQueue<T> {
    readonly queue: Deque<T>
    readonly maxSize: number | undefined

    #consumerWaiters = new Deque<Deferred<T | undefined>>()
    #producerWaiters = new Deque<Deferred<void>>()
    #ended = false

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
        return this.#ended
    }

    async enqueue(item: T): Promise<void> {
        if (this.#ended) {
            throw new Error("Cannot enqueue after .end() has been called")
        }

        if (this.#consumerWaiters.length > 0) {
            let waiter = this.#consumerWaiters.popFront()!
            waiter.resolve(item)
            return
        }

        if (this.isFull) {
            let waiter = new Deferred<void>()
            this.#producerWaiters.pushBack(waiter)
            await waiter.promise

            if (this.#ended) {
                throw new Error("Queue was ended while waiting to enqueue.")
            }
        }

        this.queue.pushBack(item)
    }

    tryEnqueue(item: T): boolean {
        if (this.#ended || this.isFull || this.#consumerWaiters.length > 0) {
            return false
        }
        this.queue.pushBack(item)
        return true
    }

    end(): void {
        if (this.#ended) throw new Error(".end() has already been called.")
        this.#ended = true

        for (let waiter of this.#consumerWaiters) {
            waiter.resolve(undefined)
        }
        this.#consumerWaiters.clear()

        let err = new Error("Queue has been ended.")
        for (let waiter of this.#producerWaiters) {
            waiter.reject(err)
        }
        this.#producerWaiters.clear()
    }

    peek(): T | undefined {
        return this.queue.peekFront()
    }

    next(): T | undefined {
        let item = this.queue.popFront()
        this.#wakeProducerIfNeeded()
        return item
    }

    async nextOrWait(): Promise<T | undefined> {
        if (this.queue.length > 0 || this.#ended) {
            let item = this.queue.popFront()
            this.#wakeProducerIfNeeded()
            return item
        }

        let waiter = new Deferred<T | undefined>()
        this.#consumerWaiters.pushBack(waiter)
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

    #wakeProducerIfNeeded(): void {
        if (this.#producerWaiters.length > 0 && !this.isFull) {
            let producer = this.#producerWaiters.popFront()!
            producer.resolve()
        }
    }
}
