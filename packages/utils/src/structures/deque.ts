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
    protected _size = 0

    constructor(array?: ArrayLike<T>, options: DequeOptions = {}) {
        this._capacity = options.capacity
        if (array) {
            this._fromArray(array)
        } else {
            this._list = new Array(4)
        }
    }

    get length(): number {
        return this._size
    }

    isEmpty(): boolean {
        return this._size === 0
    }

    at(index: number): T | undefined {
        let i = index
        if (i !== (i | 0)) return undefined
        let len = this._size
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
        if (this._size === this._list.length) this._growArray()
        this._head = (this._head - 1 + this._list.length) & this._capacityMask
        this._list[this._head] = item
        this._size++
        if (this._capacity !== undefined && this._size > this._capacity) this.popBack()
        return this._size
    }

    pushBack(item: T): number {
        if (this._size === this._list.length) this._growArray()
        this._list[this._tail] = item
        this._tail = (this._tail + 1) & this._capacityMask
        this._size++
        if (this._capacity !== undefined && this._size > this._capacity) this.popFront()
        return this._size
    }

    popFront(): T | undefined {
        if (this.isEmpty()) return undefined
        let item = this._list[this._head]
        this._list[this._head] = undefined
        this._head = (this._head + 1) & this._capacityMask
        this._size--
        if (this._size <= this._list.length / 4 && this._list.length > 4) this._shrinkArray()
        return item
    }

    popBack(): T | undefined {
        if (this.isEmpty()) return undefined
        this._tail = (this._tail - 1 + this._list.length) & this._capacityMask
        let item = this._list[this._tail]
        this._list[this._tail] = undefined
        this._size--
        if (this._size <= this._list.length / 4 && this._list.length > 4) this._shrinkArray()
        return item
    }

    removeOne(idx: number): T | undefined {
        let len = this._size
        if (idx >= len || idx < -len) return undefined
        if (idx < 0) idx += len
        let realIdx = (this._head + idx) & this._capacityMask
        let item = this._list[realIdx] as T
        this._remove(realIdx)
        return item
    }

    removeBy(predicate: (item: T) => boolean): void {
        for (let pos = 0; pos < this._size; pos++) {
            let i = (this._head + pos) & this._capacityMask
            let item = this._list[i]
            if (item !== undefined && predicate(item)) {
                this._remove(i)
                return
            }
        }
    }

    clear(): void {
        this._list = new Array(this._list.length)
        this._head = 0
        this._tail = 0
        this._size = 0
    }

    indexOf(item: T): number {
        for (let pos = 0; pos < this._size; pos++) {
            if (this._list[(this._head + pos) & this._capacityMask] === item) return pos
        }
        return -1
    }

    findIndex(predicate: (item: T) => boolean): number {
        for (let pos = 0; pos < this._size; pos++) {
            if (predicate(this._list[(this._head + pos) & this._capacityMask]!)) return pos
        }
        return -1
    }

    find(predicate: (item: T) => boolean): T | undefined {
        for (let pos = 0; pos < this._size; pos++) {
            let item = this._list[(this._head + pos) & this._capacityMask]
            if (item !== undefined && predicate(item)) return item
        }
        return undefined
    }

    includes(item: T): boolean {
        return this.indexOf(item) !== -1
    }

    toArray(): Array<T> {
        let arr: T[] = new Array(this._size)
        for (let k = 0; k < this._size; k++) {
            arr[k] = this._list[(this._head + k) & this._capacityMask]!
        }
        return arr
    }

    [Symbol.iterator](): Iterator<T> {
        let pos = 0
        return {
            next: (): IteratorResult<T> => {
                if (pos >= this._size) return { done: true, value: undefined }
                let value = this._list[(this._head + pos) & this._capacityMask]!
                pos++
                return { done: false, value }
            },
        }
    }

    protected _fromArray(array: ArrayLike<T>): void {
        let start = 0
        let length = array.length
        if (this._capacity !== undefined && length > this._capacity) {
            start = length - this._capacity
            length = this._capacity
        }
        let capacity = _nextPowerOf2(length)
        this._list = new Array(capacity)
        this._capacityMask = capacity - 1
        this._head = 0
        this._tail = length & this._capacityMask
        this._size = length
        for (let i = 0; i < length; i++) this._list[i] = array[start + i]
    }

    protected _growArray(): void {
        let oldMask = this._capacityMask
        let oldList = this._list
        let oldHead = this._head
        let size = this._size
        let newList = new Array(oldList.length << 1)
        for (let i = 0; i < size; i++) {
            newList[i] = oldList[(oldHead + i) & oldMask]
        }
        this._list = newList
        this._head = 0
        this._tail = size
        this._capacityMask = newList.length - 1
    }

    protected _shrinkArray(): void {
        if (this._list.length <= 4) return
        let oldMask = this._capacityMask
        let oldList = this._list
        let oldHead = this._head
        let size = this._size
        let newList = new Array(oldList.length >>> 1)
        for (let i = 0; i < size; i++) {
            newList[i] = oldList[(oldHead + i) & oldMask]
        }
        this._list = newList
        this._head = 0
        this._tail = size
        this._capacityMask = newList.length - 1
    }

    protected _remove(idx: number): void {
        let mask = this._capacityMask
        let len = this._list.length
        let distFromHead = (idx - this._head) & mask

        if (distFromHead < this._size - distFromHead) {
            let i = idx
            while (i !== this._head) {
                let prev = (i - 1 + len) & mask
                this._list[i] = this._list[prev]
                i = prev
            }
            this._list[this._head] = undefined
            this._head = (this._head + 1) & mask
        } else {
            let i = idx
            let last = (this._tail - 1 + len) & mask
            while (i !== last) {
                let next = (i + 1) & mask
                this._list[i] = this._list[next]
                i = next
            }
            this._list[last] = undefined
            this._tail = last
        }

        this._size--
        if (this._size <= this._list.length / 4 && this._list.length > 4) this._shrinkArray()
    }
}
