import { maybeWrapIterator } from "./_iterator"

export class CustomMap<ExternalKey, InternalKey, V> implements Map<ExternalKey, V> {
    readonly clear: Map<ExternalKey, V>["clear"]
    protected _map: Map<InternalKey, V>
    protected _mapperTo: (key: ExternalKey) => InternalKey
    protected _mapperFrom: (key: InternalKey) => ExternalKey

    constructor(
        externalToInternal: (key: ExternalKey) => InternalKey,
        internalToExternal: (key: InternalKey) => ExternalKey,
    ) {
        this._mapperTo = externalToInternal
        this._mapperFrom = internalToExternal

        let map = (this._map = new Map())
        this.clear = map.clear.bind(this._map)
    }

    get size(): number {
        return this._map.size
    }

    get [Symbol.toStringTag](): string {
        return this._map[Symbol.toStringTag]
    }

    getInternalMap(): Map<InternalKey, V> {
        return this._map
    }

    delete(key: ExternalKey): boolean {
        return this._map.delete(this._mapperTo(key))
    }

    forEach(cb: (value: V, key: ExternalKey, map: Map<ExternalKey, V>) => void, thisArg?: any): void {
        return this._map.forEach((value, key) => {
            cb.call(thisArg, value, this._mapperFrom(key), this as any)
        })
    }

    get(key: ExternalKey): V | undefined {
        return this._map.get(this._mapperTo(key))
    }

    has(key: ExternalKey): boolean {
        return this._map.has(this._mapperTo(key))
    }

    set(key: ExternalKey, value: V): this {
        this._map.set(this._mapperTo(key), value)
        return this
    }

    getOrInsert(key: ExternalKey, value: V): ReturnType<Map<ExternalKey, V>["getOrInsert"]> {
        if (this._map.getOrInsert) {
            return this._map.getOrInsert(this._mapperTo(key), value)
        }
        let k = this._mapperTo(key)
        if (!this._map.has(k)) this._map.set(k, value)
        return this._map.get(k)!
    }

    getOrInsertComputed(
        key: ExternalKey,
        callback: (key: ExternalKey) => V,
    ): ReturnType<Map<ExternalKey, V>["getOrInsertComputed"]> {
        if (this._map.getOrInsertComputed) {
            return this._map.getOrInsertComputed(this._mapperTo(key), (k) => callback(this._mapperFrom(k)))
        }
        let k = this._mapperTo(key)
        if (!this._map.has(k)) this._map.set(k, callback(key))
        return this._map.get(k)!
    }

    entries(): ReturnType<Map<ExternalKey, V>["entries"]> {
        let inner = this._map.entries()
        const iterator: IterableIterator<[ExternalKey, V]> = {
            [Symbol.iterator]: () => iterator,
            next: () => {
                let { done, value } = inner.next() as IteratorResult<[InternalKey, V], undefined>
                if (done) return { done, value }
                return {
                    done,
                    value: [this._mapperFrom(value![0]), value![1]] as const,
                }
            },
        }

        return maybeWrapIterator(iterator) as ReturnType<Map<ExternalKey, V>["entries"]>
    }

    keys(): ReturnType<Map<ExternalKey, V>["keys"]> {
        let inner = this._map.keys()
        const iterator: IterableIterator<ExternalKey> = {
            [Symbol.iterator]: () => iterator,
            next: () => {
                let { done, value } = inner.next() as IteratorResult<InternalKey, undefined>
                if (done) return { done, value }
                return { done, value: this._mapperFrom(value!) }
            },
        }

        return maybeWrapIterator(iterator) as ReturnType<Map<ExternalKey, V>["keys"]>
    }

    values(): ReturnType<Map<ExternalKey, V>["values"]> {
        let inner = this._map.values()
        const iterator: IterableIterator<V> = {
            [Symbol.iterator]: () => iterator,
            next: () => {
                let { done, value } = inner.next() as IteratorResult<V, undefined>
                if (done) return { done, value }
                return { done, value: value! }
            },
        }

        return maybeWrapIterator(iterator) as ReturnType<Map<ExternalKey, V>["values"]>
    }

    [Symbol.iterator](): ReturnType<Map<ExternalKey, V>["entries"]> {
        return this.entries()
    }
}
