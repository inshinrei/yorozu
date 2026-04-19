interface TwoWayLinkedList<K, V> {
    key: K
    value: V
    prev?: TwoWayLinkedList<K, V>
    next?: TwoWayLinkedList<K, V>
}

export class LruMap<K, V> {
    #capacity: number
    #head?: TwoWayLinkedList<K, V>
    #tail?: TwoWayLinkedList<K, V>
    #map: Map<K, TwoWayLinkedList<K, V>>
    #size = 0

    constructor(capacity: number, MapImpl: new () => Map<K, TwoWayLinkedList<K, V>> = Map) {
        this.#capacity = capacity
        this.#map = new MapImpl()
    }

    get size(): number {
        return this.#size
    }

    get(key: K): V | undefined {
        let item = this.#map.get(key)
        if (!item) return undefined
        this.#markUsed(item)
        return item.value
    }

    has(key: K): boolean {
        return this.#map.has(key)
    }

    set(key: K, value: V): void {
        let item = this.#map.get(key)
        if (item) {
            item.value = value
            this.#markUsed(item)
            return
        }

        item = {
            key,
            value,
            next: undefined,
            prev: undefined,
        }
        this.#map.set(key, item)
        if (this.#head) {
            this.#head.prev = item
            item.next = this.#head
        } else {
            this.#tail = item
        }

        this.#head = item
        this.#size += 1
        if (this.#size > this.#capacity) {
            let oldest = this.#tail
            if (oldest) this.#remove(oldest)
        }
    }

    delete(key: K): void {
        let item = this.#map.get(key)
        if (item) this.#remove(item)
    }

    clear(): void {
        this.#map.clear()
        this.#head = undefined
        this.#tail = undefined
        this.#size = 0
    }

    #markUsed(item: TwoWayLinkedList<K, V>): void {
        if (item === this.#head) return
        if (item.prev) {
            if (item === this.#tail) this.#tail = item.prev
            item.prev.next = item.next
        }

        if (item.next) item.next.prev = item.prev
        item.prev = undefined
        item.next = this.#head
        if (this.#head) this.#head.prev = item
        this.#head = item
    }

    #remove(item: TwoWayLinkedList<K, V>): void {
        if (item.prev) {
            this.#tail = item.prev
            this.#tail.next = undefined
        } else {
            this.#tail = undefined
            this.#head = undefined
        }

        item.prev = item.next = undefined
        this.#map.delete(item.key)
        this.#size -= 1
    }
}
