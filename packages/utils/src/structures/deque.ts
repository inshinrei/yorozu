const Log2 = Math.log(2)

function _nextPowerOf2(n: number): number {
    if (n <= 4) return 4
    return 1 << Math.ceil(Math.log(n) / Log2)
}

export interface DequeOptions {
    capacity?: number
}

export class Deque<T> {
    protected _list!: Array<T | undefined>
    protected _head = 0
    protected _tail = 0
    protected _capacityMask = 3
    protected _capacity?: number

    constructor(array?: ArrayLike<T>, options: DequeOptions = {}) {
        this._capacity = options.capacity
        if (array) {
            this.#fromArray(array)
        } else {
            this._list = new Array(4)
        }
    }

    get length(): number {
        return (this._tail - this._head) & this._capacityMask
    }

    isEmpty(): boolean {
        return this._head === this._tail
    }

    at(index: number): T | undefined {
        let i = index
        if (i !== (i | 0)) return undefined
        const len = this.length
        if (i >= len || i < -len) return undefined
        if (i < 0) i += len
        return this._list[(this._head + i) & this._capacityMask]
    }

    peekFront(): T | undefined {
        return this.isEmpty() ? undefined : this._list[this._head]
    }

    peekBack(): T | undefined {
        return this.isEmpty() ? undefined : this._list[(this._tail - 1 + this._list.length) & this._capacityMask]
    }

    pushFront(item: T): number {
        this._head = (this._head - 1 + this._list.length) & this._capacityMask
        this._list[this._head] = item
        if (this._head === this._tail) this.#growArray()
        if (this._capacity !== undefined && this.length > this._capacity) this.popBack()
        return this.length
    }

    pushBack(item: T): number {
        this._list[this._tail] = item
        this._tail = (this._tail + 1) & this._capacityMask
        if (this._head === this._tail) this.#growArray()
        if (this._capacity !== undefined && this.length > this._capacity) this.popFront()
        return this.length
    }

    popFront(): T | undefined {
        if (this.isEmpty()) return undefined
        const item = this._list[this._head]
        this._list[this._head] = undefined
        this._head = (this._head + 1) & this._capacityMask
        if (this._head < 2 && this._tail > 10000 && this._tail <= this._list.length >>> 2) this.#shrinkArray()
        return item
    }

    popBack(): T | undefined {
        if (this.isEmpty()) return undefined
        const idx = (this._tail - 1 + this._list.length) & this._capacityMask
        const item = this._list[idx]
        this._list[idx] = undefined
        this._tail = idx
        if (this._head < 2 && this._tail > 10000 && this._tail <= this._list.length >>> 2) this.#shrinkArray()
        return item
    }

    removeOne(idx: number): T | undefined {
        const len = this.length
        if (idx >= len || idx < -len) return undefined
        if (idx < 0) idx += len
        const realIdx = (this._head + idx) & this._capacityMask
        const item = this._list[realIdx] as T
        this.#remove(realIdx)
        return item
    }

    removeBy(predicate: (item: T) => boolean): void {
        let i = this._head
        while (i !== this._tail) {
            const item = this._list[i]
            if (item !== undefined && predicate(item)) {
                this.#remove(i)
                return
            }
            i = (i + 1) & this._capacityMask
        }
    }

    clear(): void {
        this._list = new Array(this._list.length)
        this._head = 0
        this._tail = 0
    }

    indexOf(item: T): number {
        let i = this._head
        let pos = 0
        while (i !== this._tail) {
            if (this._list[i] === item) return pos
            i = (i + 1) & this._capacityMask
            pos++
        }
        return -1
    }

    findIndex(predicate: (item: T) => boolean): number {
        let i = this._head
        let pos = 0
        while (i !== this._tail) {
            if (predicate(this._list[i]!)) return pos
            i = (i + 1) & this._capacityMask
            pos++
        }
        return -1
    }

    find(predicate: (item: T) => boolean): T | undefined {
        let i = this._head
        while (i !== this._tail) {
            const item = this._list[i]
            if (item !== undefined && predicate(item)) return item
            i = (i + 1) & this._capacityMask
        }
        return undefined
    }

    includes(item: T): boolean {
        return this.indexOf(item) !== -1
    }

    toArray(): Array<T> {
        const arr: T[] = new Array(this.length)
        let i = this._head
        let k = 0
        while (i !== this._tail) {
            arr[k++] = this._list[i]!
            i = (i + 1) & this._capacityMask
        }
        return arr
    }

    [Symbol.iterator](): Iterator<T> {
        let i = this._head
        return {
            next: (): IteratorResult<T> => {
                if (i === this._tail) return { done: true, value: undefined }
                const value = this._list[i]!
                i = (i + 1) & this._capacityMask
                return { done: false, value }
            },
        }
    }

    #fromArray(array: ArrayLike<T>): void {
        const capacity = _nextPowerOf2(array.length)
        this._list = new Array(capacity)
        this._capacityMask = capacity - 1
        this._tail = array.length
        for (let i = 0; i < array.length; i++) this._list[i] = array[i]
    }

    #growArray(): void {
        const newCapacity = this._list.length << 1
        const newList = new Array(newCapacity)

        let k = 0
        let i = this._head
        while (i !== this._tail) {
            newList[k++] = this._list[i]
            i = (i + 1) & this._capacityMask
        }

        this._list = newList
        this._head = 0
        this._tail = k
        this._capacityMask = newCapacity - 1
    }

    #shrinkArray(): void {
        if (this._list.length <= 4) return
        const newCapacity = this._list.length >>> 1
        const newList = new Array(newCapacity)

        let k = 0
        let i = this._head
        while (i !== this._tail) {
            newList[k++] = this._list[i]
            i = (i + 1) & this._capacityMask
        }

        this._list = newList
        this._head = 0
        this._tail = k
        this._capacityMask = newCapacity - 1
    }

    #remove(idx: number): void {
        const mask = this._capacityMask
        const len = this._list.length

        if (idx - this._head < this.length - (idx - this._head)) {
            let i = idx
            while (i > this._head) {
                this._list[i] = this._list[(i - 1 + len) & mask]
                i = (i - 1 + len) & mask
            }
            this._list[this._head] = undefined
            this._head = (this._head + 1) & mask
        } else {
            let i = idx
            while (i !== this._tail) {
                this._list[i] = this._list[(i + 1) & mask]
                i = (i + 1) & mask
            }
            this._list[(this._tail - 1 + len) & mask] = undefined
            this._tail = (this._tail - 1 + len) & mask
        }
    }
}
