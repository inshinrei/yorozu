import { maybeWrapIterator } from "./_iterator"

export class CustomSet<ExternalKey, InternalKey> implements Set<ExternalKey> {
    readonly clear: Set<ExternalKey>["clear"]
    protected _set: Set<InternalKey>
    protected _mapperTo: (key: ExternalKey) => InternalKey
    protected _mapperFrom: (key: InternalKey) => ExternalKey

    constructor(
        externalToInternal: (key: ExternalKey) => InternalKey,
        internalToExternal: (key: InternalKey) => ExternalKey,
    ) {
        this._mapperTo = externalToInternal
        this._mapperFrom = internalToExternal
        let set = (this._set = new Set())
        this.clear = set.clear.bind(set)
    }

    get size(): number {
        return this._set.size
    }

    get [Symbol.toStringTag](): string {
        return this._set[Symbol.toStringTag]
    }

    add(value: ExternalKey): this {
        this._set.add(this._mapperTo(value))
        return this
    }

    delete(value: ExternalKey): boolean {
        return this._set.delete(this._mapperTo(value))
    }

    forEach(cb: (value: ExternalKey, value2: ExternalKey, set: Set<ExternalKey>) => void, thisArg?: any): void {
        this._set.forEach((value) => {
            let mapped = this._mapperFrom(value)
            cb.call(thisArg, mapped, mapped, this as any)
        })
    }

    has(value: ExternalKey): boolean {
        return this._set.has(this._mapperTo(value))
    }

    entries(): ReturnType<Set<ExternalKey>["entries"]> {
        let inner = this._set.entries()
        const iterator: IterableIterator<[ExternalKey, ExternalKey]> = {
            [Symbol.iterator]: () => iterator,
            next: () => {
                let { done, value } = inner.next() as IteratorResult<[InternalKey, InternalKey], undefined>
                if (done) return { done, value }
                let mapped = this._mapperFrom(value![0])
                return {
                    done,
                    value: [mapped, mapped] as const,
                }
            },
        }

        return maybeWrapIterator(iterator) as ReturnType<Set<ExternalKey>["entries"]>
    }

    keys(): ReturnType<Set<ExternalKey>["keys"]> {
        let inner = this._set.keys()
        const iterator: IterableIterator<ExternalKey> = {
            [Symbol.iterator]: () => iterator,
            next: () => {
                let { done, value } = inner.next() as IteratorResult<InternalKey, undefined>
                if (done) return { done, value }
                return { done, value: this._mapperFrom(value!) }
            },
        }

        return maybeWrapIterator(iterator) as ReturnType<Set<ExternalKey>["keys"]>
    }

    values(): ReturnType<Set<ExternalKey>["values"]> {
        return this.keys()
    }

    union<U>(other: Set<U>): Set<ExternalKey | U> {
        let newSet = new CustomSet<ExternalKey | U, InternalKey | U>(
            (k) => this._mapperTo(k as any) as any,
            (k) => this._mapperFrom(k as any) as any,
        )
        this._set.forEach((v) => newSet.add(this._mapperFrom(v) as any))
        other.forEach((v) => newSet.add(v as any))
        return newSet as any
    }

    intersection<U>(other: Set<U>): Set<ExternalKey & U> {
        let newSet = new CustomSet<ExternalKey & U, InternalKey>(
            (k) => this._mapperTo(k as any),
            (k) => this._mapperFrom(k) as any,
        )
        this._set.forEach((v) => {
            let ext = this._mapperFrom(v)
            if (other.has(ext as any)) newSet.add(ext as any)
        })
        return newSet as any
    }

    difference<U>(other: ReadonlySetLike<ExternalKey & U>): Set<ExternalKey> {
        let newSet = new CustomSet(this._mapperTo, this._mapperFrom)
        this._set.forEach((v) => {
            let ext = this._mapperFrom(v)
            if (!other.has(ext as any)) newSet.add(ext)
        })
        return newSet as any
    }

    symmetricDifference<U>(other: Set<U>): Set<ExternalKey | U> {
        let newSet = new CustomSet<ExternalKey | U, InternalKey | U>(
            (k) => this._mapperTo(k as any) as any,
            (k) => this._mapperFrom(k as any) as any,
        )
        this._set.forEach((v) => {
            let ext = this._mapperFrom(v)
            if (!other.has(ext as any)) newSet.add(ext as any)
        })
        other.forEach((v) => {
            if (!this.has(v as any)) newSet.add(v as any)
        })
        return newSet as any
    }

    isSubsetOf(other: ReadonlySetLike<ExternalKey>): boolean {
        for (let v of this._set) {
            if (!other.has(this._mapperFrom(v))) return false
        }
        return true
    }

    isSupersetOf(other: Set<ExternalKey>): boolean {
        for (let v of other) {
            if (!this.has(v)) return false
        }
        return true
    }

    isDisjointFrom(other: Set<ExternalKey>): boolean {
        for (let v of other) {
            if (this.has(v)) return false
        }
        return true
    }

    [Symbol.iterator](): ReturnType<Set<ExternalKey>["keys"]> {
        return this.keys()
    }

    getInternalSet(): Set<InternalKey> {
        return this._set
    }
}
