export class LruSet<T> {
    #capacity: number
    #set: Set<T>

    constructor(capacity: number, SetImpl: new () => Set<T> = Set) {
        this.#capacity = capacity
        this.#set = new SetImpl()
    }

    get size(): number {
        return this.#set.size
    }

    add(value: T): void {
        if (this.#set.has(value)) {
            this.#set.delete(value)
        }
        this.#set.add(value)

        if (this.#set.size > this.#capacity) {
            let oldest = this.#set.keys().next().value
            if (oldest !== undefined) {
                this.#set.delete(oldest)
            }
        }
    }

    has(value: T): boolean {
        return this.#set.has(value)
    }

    clear(): void {
        this.#set.clear()
    }

    *[Symbol.iterator](): IterableIterator<T> {
        yield* this.#set
    }

    toArray(): Array<T> {
        return Array.from(this.#set)
    }
}
