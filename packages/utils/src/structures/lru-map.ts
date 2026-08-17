export class LruMap<K, V> {
    protected _capacity: number
    protected _map: Map<K, V>

    constructor(capacity: number, MapImpl: new () => Map<K, V> = Map) {
        this._capacity = capacity
        this._map = new MapImpl()
    }

    get size(): number {
        return this._map.size
    }

    get(key: K): V | undefined {
        if (!this._map.has(key)) return undefined
        let value = this._map.get(key)!
        this._map.delete(key)
        this._map.set(key, value)
        return value
    }

    has(key: K): boolean {
        return this._map.has(key)
    }

    set(key: K, value: V): void {
        if (this._map.has(key)) {
            this._map.delete(key)
        }
        this._map.set(key, value)

        if (this._map.size > this._capacity) {
            let oldest = this._map.keys().next()
            if (!oldest.done) this._map.delete(oldest.value)
        }
    }

    delete(key: K): void {
        this._map.delete(key)
    }

    clear(): void {
        this._map.clear()
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        yield* this._map
    }

    entries(): IterableIterator<[K, V]> {
        return this._map.entries()
    }

    keys(): IterableIterator<K> {
        return this._map.keys()
    }

    values(): IterableIterator<V> {
        return this._map.values()
    }
}
