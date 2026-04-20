import { beforeEach, describe, expect, it } from "vitest"
import { AsyncQueue } from "./async-queue"
import { Deque } from "../structures"

describe("AsyncQueue", () => {
    let queue: AsyncQueue<number>

    beforeEach(() => {
        queue = new AsyncQueue<number>()
    })

    const createQueueWithItems = (items: number[]) => new AsyncQueue<number>(items)

    it("initializes empty", () => {
        expect(queue.length).toBe(0)
        expect(queue.ended).toBe(false)
    })

    it("initializes from array", () => {
        let q = createQueueWithItems([10, 20])
        expect(q.length).toBe(2)
        expect(q.peek()).toBe(10)
        expect(q.next()).toBe(10)
        expect(q.next()).toBe(20)
        expect(q.next()).toBeUndefined()
    })

    it("initializes from Deque", () => {
        let d = new Deque([5, 6])
        let q = new AsyncQueue(d)
        expect(q.length).toBe(2)
        expect(q.next()).toBe(5)
    })

    it("enqueues and dequeues immediately", () => {
        queue.enqueue(42)
        expect(queue.length).toBe(1)
        expect(queue.peek()).toBe(42)
        expect(queue.next()).toBe(42)
        expect(queue.length).toBe(0)
    })

    it("resolves waiting nextOrWait immediately on enqueue (waiter path)", async () => {
        let promise = queue.nextOrWait()
        queue.enqueue(99)
        let result = await promise
        expect(result).toBe(99)
        expect(queue.length).toBe(0)
    })

    it("nextOrWait returns immediately if items already present", async () => {
        queue.enqueue(1)
        let item = await queue.nextOrWait()
        expect(item).toBe(1)
    })

    it("nextOrWait returns undefined after end() when empty", async () => {
        queue.end()
        let item = await queue.nextOrWait()
        expect(item).toBeUndefined()
    })

    it("end() resolves all pending waiters with undefined", async () => {
        let p1 = queue.nextOrWait()
        let p2 = queue.nextOrWait()
        queue.end()
        expect(await p1).toBeUndefined()
        expect(await p2).toBeUndefined()
        expect(queue.ended).toBe(true)
    })

    it("throws on double end", () => {
        queue.end()
        expect(() => queue.end()).toThrow(".end() has already been called.")
    })

    it("maintains FIFO order for multiple waiters", async () => {
        let p1 = queue.nextOrWait()
        let p2 = queue.nextOrWait()
        queue.enqueue(100)
        queue.enqueue(200)
        expect(await p1).toBe(100)
        expect(await p2).toBe(200)
    })

    it("supports async iterator until end", async () => {
        queue.enqueue(1)
        queue.enqueue(2)
        queue.end()

        let items: number[] = []
        for await (let val of queue) {
            items.push(val)
        }
        expect(items).toEqual([1, 2])
    })

    it("async iterator stops immediately on end() with no items", async () => {
        queue.end()
        let items: number[] = []
        for await (let val of queue) {
            items.push(val)
        }
        expect(items).toEqual([])
    })

    it("peek and next still work safely after partial consumption", () => {
        queue.enqueue(55)
        expect(queue.peek()).toBe(55)
        expect(queue.next()).toBe(55)
        expect(queue.peek()).toBeUndefined()
    })
})
