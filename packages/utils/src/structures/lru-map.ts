export class LruMap<K, V> {
    #capacity: number
    #map: Map<K, V>

    constructor(capacity: number, MapImpl: new () => Map<K, V> = Map) {
        this.#capacity = capacity
        this.#map = new MapImpl()
    }

    get size(): number {
        return this.#map.size
    }

    get(key: K): V | undefined {
        if (!this.#map.has(key)) return undefined
        let value = this.#map.get(key)!
        this.#map.delete(key)
        this.#map.set(key, value)
        return value
    }

    has(key: K): boolean {
        return this.#map.has(key)
    }

    set(key: K, value: V): void {
        if (this.#map.has(key)) {
            this.#map.delete(key)
        }
        this.#map.set(key, value)

        if (this.#map.size > this.#capacity) {
            let oldest = this.#map.keys().next().value
            if (oldest !== undefined) {
                this.#map.delete(oldest)
            }
        }
    }

    delete(key: K): void {
        this.#map.delete(key)
    }

    clear(): void {
        this.#map.clear()
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        yield* this.#map
    }

    entries(): IterableIterator<[K, V]> {
        return this.#map.entries()
    }

    keys(): IterableIterator<K> {
        return this.#map.keys()
    }

    values(): IterableIterator<V> {
        return this.#map.values()
    }
}
