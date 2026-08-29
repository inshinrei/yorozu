export class BytesLruMap<K, V> {
    protected _maxBytes: number
    protected _maxEntries: number | undefined
    protected _sizeOf: (value: V) => number
    protected _onEvict: ((key: K, value: V) => void) | undefined
    protected _acceptOversize: boolean
    protected _map: Map<K, V> = new Map()
    protected _bytesByKey: Map<K, number> = new Map()
    protected _byteSize: number = 0

    constructor(opts: {
        maxBytes: number
        sizeOf: (value: V) => number
        maxEntries?: number
        onEvict?: (key: K, value: V) => void
        acceptOversize?: boolean
    }) {
        this._maxBytes = opts.maxBytes
        this._maxEntries = opts.maxEntries
        this._sizeOf = opts.sizeOf
        this._onEvict = opts.onEvict
        this._acceptOversize = opts.acceptOversize === true
    }

    get size(): number {
        return this._map.size
    }

    get byteSize(): number {
        return this._byteSize
    }

    get maxBytes(): number {
        return this._maxBytes
    }

    setMaxBytes(next: number): void {
        this._maxBytes = next
        this._evictWhileOver()
    }

    get(key: K): V | undefined {
        if (!this._map.has(key)) return undefined
        let value = this._map.get(key)!
        this._map.delete(key)
        this._map.set(key, value)
        return value
    }

    peek(key: K): V | undefined {
        return this._map.get(key)
    }

    has(key: K): boolean {
        return this._map.has(key)
    }

    set(key: K, value: V): boolean {
        let nextBytes = this._sizeOf(value)
        if (nextBytes > this._maxBytes && this._acceptOversize !== true) return false
        if (this._map.has(key)) {
            this._byteSize -= this._bytesByKey.get(key) ?? 0
            this._map.delete(key)
        }
        this._map.set(key, value)
        this._bytesByKey.set(key, nextBytes)
        this._byteSize += nextBytes
        this._evictWhileOver()
        return true
    }

    delete(key: K): boolean {
        if (!this._map.has(key)) return false
        this._byteSize -= this._bytesByKey.get(key) ?? 0
        this._map.delete(key)
        this._bytesByKey.delete(key)
        return true
    }

    clear(): void {
        this._map.clear()
        this._bytesByKey.clear()
        this._byteSize = 0
    }

    *[Symbol.iterator](): IterableIterator<[K, V]> {
        yield* this._map
    }

    protected _evictWhileOver(): void {
        for (;;) {
            let overEntries = this._maxEntries != null && this._map.size > this._maxEntries
            let overBytes = this._byteSize > this._maxBytes
            if (!overEntries && !overBytes) return
            if (this._map.size === 0) return
            if (!overEntries && overBytes && this._acceptOversize && this._map.size === 1) return
            this._evictLru()
        }
    }

    protected _evictLru(): void {
        let oldest = this._map.keys().next()
        if (oldest.done) return
        let key = oldest.value
        let value = this._map.get(key)!
        this._byteSize -= this._bytesByKey.get(key) ?? 0
        this._map.delete(key)
        this._bytesByKey.delete(key)
        this._onEvict?.(key, value)
    }
}
