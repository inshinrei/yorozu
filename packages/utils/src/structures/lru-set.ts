interface OneWayLinkedList<T> {
    value: T
    next?: OneWayLinkedList<T>
}

export class LruSet<T> {
    #capacity: number
    #head?: OneWayLinkedList<T>
    #tail?: OneWayLinkedList<T>
    #set: Set<T>

    constructor(capacity: number, SetImpl: new () => Set<T> = Set) {
        this.#capacity = capacity
        this.#set = new SetImpl()
    }

    get size(): number {
        return this.#set.size
    }

    add(value: T): void {
        if (this.#set.has(value)) return
        if (!this.#head) this.#head = { value }
        if (!this.#tail) this.#tail = this.#head
        else {
            this.#tail.next = { value }
            this.#tail = this.#tail.next
        }

        this.#set.add(value)
        if (this.#set.size > this.#capacity && this.#head !== undefined) {
            this.#set.delete(this.#head.value)
            this.#head = this.#head.next
        }
    }

    has(value: T): boolean {
        return this.#set.has(value)
    }

    clear(): void {
        this.#head = this.#tail = undefined
        this.#set.clear()
    }
}
