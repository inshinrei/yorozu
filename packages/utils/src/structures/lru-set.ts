export class LruSet<T> {
    protected _capacity: number
    protected _set: Set<T>

    constructor(capacity: number, SetImpl: new () => Set<T> = Set) {
        this._capacity = capacity
        this._set = new SetImpl()
    }

    get size(): number {
        return this._set.size
    }

    add(value: T): void {
        if (this._set.has(value)) {
            this._set.delete(value)
        }
        this._set.add(value)

        if (this._set.size > this._capacity) {
            let oldest = this._set.keys().next()
            if (!oldest.done) this._set.delete(oldest.value)
        }
    }

    has(value: T): boolean {
        return this._set.has(value)
    }

    delete(value: T): boolean {
        return this._set.delete(value)
    }

    clear(): void {
        this._set.clear()
    }

    *[Symbol.iterator](): IterableIterator<T> {
        yield* this._set
    }

    toArray(): Array<T> {
        return Array.from(this._set)
    }
}
