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

    it("async iterator yields undefined values and continues", async () => {
        let q = new AsyncQueue<number | undefined>()
        await q.enqueue(1)
        await q.enqueue(undefined)
        await q.enqueue(2)
        q.end()
        let items: Array<number | undefined> = []
        for await (let val of q) items.push(val)
        expect(items).toEqual([1, undefined, 2])
    })

    it("async iterator waiter path yields undefined without ending", async () => {
        let q = new AsyncQueue<number | undefined>()
        let items: Array<number | undefined> = []
        let consumed = (async () => {
            for await (let val of q) items.push(val)
        })()
        await q.enqueue(undefined)
        await q.enqueue(1)
        q.end()
        await consumed
        expect(items).toEqual([undefined, 1])
    })

    it("peek and next still work safely after partial consumption", () => {
        queue.enqueue(55)
        expect(queue.peek()).toBe(55)
        expect(queue.next()).toBe(55)
        expect(queue.peek()).toBeUndefined()
    })

    it("tryEnqueue delivers to a waiting consumer", async () => {
        let q = new AsyncQueue<number>()
        let p = q.nextOrWait()
        expect(q.tryEnqueue(7)).toBe(true)
        expect(await p).toBe(7)
    })

    it("bounded enqueue does not exceed maxSize after a wake race", async () => {
        let q = new AsyncQueue<number>(undefined, 1)
        await q.enqueue(1)
        let blocked = q.enqueue(2)
        let blockedSettled = false
        void blocked.then(() => {
            blockedSettled = true
        })
        q.next()
        await q.enqueue(3)
        // 3 took the freed slot before 2 resumed; 2 must wait again
        await Promise.resolve()
        expect(q.length).toBeLessThanOrEqual(1)
        expect(blockedSettled).toBe(false)
    })

    it("throws on enqueue after end", async () => {
        let q = new AsyncQueue<number>()
        q.end()
        await expect(q.enqueue(1)).rejects.toThrow(/end/)
    })

    it("throws when initial items exceed maxSize", () => {
        expect(() => new AsyncQueue([1, 2], 1)).toThrow(/maxSize/)
        expect(() => new AsyncQueue(new Deque([1, 2]), 1)).toThrow(/maxSize/)
    })

    it("does not exceed maxSize when next on empty wakes a second producer", async () => {
        let q = new AsyncQueue<number>(undefined, 1)
        await q.enqueue(1)
        let p2 = q.enqueue(2)
        let p3 = q.enqueue(3)
        void p2.catch(() => {})
        q.next()
        q.next()
        // empty next must not resolve p3; end() then rejects the still-queued waiter
        q.end()
        await expect(p3).rejects.toThrow("Queue has been ended.")
        expect(q.length).toBeLessThanOrEqual(1)
    })
})
