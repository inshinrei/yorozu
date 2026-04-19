import { maybeWrapIterator } from "./_iterator"

export class CustomMap<ExternalKey, InternalKey, V> implements Map<ExternalKey, V> {
    readonly clear: Map<ExternalKey, V>["clear"]
    #map: Map<InternalKey, V>
    #mapperTo: (key: ExternalKey) => InternalKey
    #mapperFrom: (key: InternalKey) => ExternalKey

    constructor(
        externalToInternal: (key: ExternalKey) => InternalKey,
        internalToExternal: (key: InternalKey) => ExternalKey,
    ) {
        this.#mapperTo = externalToInternal
        this.#mapperFrom = internalToExternal

        let map = (this.#map = new Map())
        this.clear = map.clear.bind(this.#map)
    }

    get size(): number {
        return this.#map.size
    }

    get [Symbol.toStringTag](): string {
        return this.#map[Symbol.toStringTag]
    }

    getInternalMap(): Map<InternalKey, V> {
        return this.#map
    }

    delete(key: ExternalKey): boolean {
        return this.#map.delete(this.#mapperTo(key))
    }

    forEach(cb: (value: V, key: ExternalKey, map: Map<ExternalKey, V>) => void, thisArg?: any): void {
        return this.#map.forEach((value, key) => {
            cb.call(thisArg, value, this.#mapperFrom(key), this as any)
        })
    }

    get(key: ExternalKey): V | undefined {
        return this.#map.get(this.#mapperTo(key))
    }

    has(key: ExternalKey): boolean {
        return this.#map.has(this.#mapperTo(key))
    }

    set(key: ExternalKey, value: V): this {
        this.#map.set(this.#mapperTo(key), value)
        return this
    }

    getOrInsert(key: ExternalKey, value: V): ReturnType<Map<ExternalKey, V>["getOrInsert"]> {
        if (!this.#map.getOrInsert) {
            return value
        }
        return this.#map.getOrInsert(this.#mapperTo(key), value)
    }

    getOrInsertComputed(
        key: ExternalKey,
        callback: (key: ExternalKey) => V,
    ): ReturnType<Map<ExternalKey, V>["getOrInsertComputed"]> {
        return this.#map.getOrInsertComputed(this.#mapperTo(key), (key) => callback(this.#mapperFrom(key)))
    }

    entries(): ReturnType<Map<ExternalKey, V>["entries"]> {
        let inner = this.#map.entries()
        const iterator: IterableIterator<[ExternalKey, V]> = {
            [Symbol.iterator]: () => iterator,
            next: () => {
                let { done, value } = inner.next() as IteratorResult<[InternalKey, V], undefined>
                if (done) return { done, value }
                return {
                    done,
                    value: [this.#mapperFrom(value![0]), value![1]] as const,
                }
            },
        }

        return maybeWrapIterator(iterator) as ReturnType<Map<ExternalKey, V>["entries"]>
    }

    keys(): ReturnType<Map<ExternalKey, V>["keys"]> {
        let inner = this.#map.keys()
        const iterator: IterableIterator<ExternalKey> = {
            [Symbol.iterator]: () => iterator,
            next: () => {
                let { done, value } = inner.next() as IteratorResult<InternalKey, undefined>
                if (done) return { done, value }
                return { done, value: this.#mapperFrom(value!) }
            },
        }

        return maybeWrapIterator(iterator) as ReturnType<Map<ExternalKey, V>["keys"]>
    }

    values(): ReturnType<Map<ExternalKey, V>["values"]> {
        let inner = this.#map.values()
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
