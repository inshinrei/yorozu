import { beforeEach, describe, expect, it } from "vitest"
import { Deque } from "./deque"

describe("Deque", () => {
    let deque: Deque<number>

    beforeEach(() => {
        deque = new Deque()
    })

    it("starts empty", () => {
        expect(deque.length).toBe(0)
        expect(deque.isEmpty()).toBe(true)
        expect(deque.peekFront()).toBeUndefined()
        expect(deque.peekBack()).toBeUndefined()
    })

    it("pushBack / popBack", () => {
        deque.pushBack(10)
        deque.pushBack(20)
        deque.pushBack(30)

        expect(deque.length).toBe(3)
        expect(deque.peekBack()).toBe(30)
        expect(deque.popBack()).toBe(30)
        expect(deque.popBack()).toBe(20)
        expect(deque.popBack()).toBe(10)
        expect(deque.length).toBe(0)
    })

    it("pushFront / popFront", () => {
        deque.pushFront(10)
        deque.pushFront(20)
        deque.pushFront(30)

        expect(deque.length).toBe(3)
        expect(deque.peekFront()).toBe(30)
        expect(deque.popFront()).toBe(30)
        expect(deque.popFront()).toBe(20)
        expect(deque.popFront()).toBe(10)
        expect(deque.length).toBe(0)
    })

    it.todo("mix of pushFront and pushBack", () => {
        deque.pushBack(1)
        deque.pushFront(2)
        deque.pushBack(3)
        deque.pushFront(4)

        expect([...deque]).toEqual([4, 2, 1, 3])
        expect(deque.length).toBe(4)
    })

    it("at() supports positive and negative indices", () => {
        deque.pushBack(10)
        deque.pushBack(20)
        deque.pushBack(30)

        expect(deque.at(0)).toBe(10)
        expect(deque.at(1)).toBe(20)
        expect(deque.at(2)).toBe(30)
        expect(deque.at(-1)).toBe(30)
        expect(deque.at(-2)).toBe(20)
        expect(deque.at(99)).toBeUndefined()
        expect(deque.at(-99)).toBeUndefined()
    })

    it.todo("respects optional capacity limit (drops from opposite end)", () => {
        let limited = new Deque<number>(undefined, { capacity: 3 })

        limited.pushBack(1)
        limited.pushBack(2)
        limited.pushBack(3)
        limited.pushBack(4)

        expect(limited.length).toBe(3)
        expect([...limited]).toEqual([2, 3, 4])

        limited.pushFront(0)
        expect([...limited]).toEqual([0, 2, 3])
    })

    it.todo("indexOf, includes, find, findIndex work correctly", () => {
        deque.pushBack(10)
        deque.pushBack(20)
        deque.pushBack(30)
        deque.pushBack(20)

        expect(deque.indexOf(20)).toBe(1)
        expect(deque.indexOf(99)).toBe(-1)
        expect(deque.includes(20)).toBe(true)
        expect(deque.includes(99)).toBe(false)

        expect(deque.find((x) => x > 15)).toBe(20)
        expect(deque.findIndex((x) => x === 30)).toBe(2)
    })

    it.todo("removeOne removes by index", () => {
        deque.pushBack(10)
        deque.pushBack(20)
        deque.pushBack(30)
        deque.pushBack(40)

        expect(deque.removeOne(1)).toBe(20)
        expect([...deque]).toEqual([10, 30, 40])
    })

    it.todo("removeBy removes first matching element", () => {
        deque.pushBack(10)
        deque.pushBack(20)
        deque.pushBack(30)
        deque.pushBack(20)

        deque.removeBy((x) => x === 20)
        expect([...deque]).toEqual([10, 30, 20])
    })

    it("toArray returns correct copy", () => {
        deque.pushBack(1)
        deque.pushBack(2)
        deque.pushFront(0)

        let arr = deque.toArray()
        expect(arr).toEqual([0, 1, 2])
        expect(arr).not.toBe(deque)
    })

    it("iterator works correctly with wrap-around", () => {
        deque.pushBack(10)
        deque.pushBack(20)
        deque.pushFront(5)

        let result: number[] = []
        for (let x of deque) result.push(x)

        expect(result).toEqual([5, 10, 20])
    })

    it.todo("grows automatically when full", () => {
        for (let i = 0; i < 100; i++) {
            deque.pushBack(i)
        }
        expect(deque.length).toBe(100)
        expect(deque.at(0)).toBe(0)
        expect(deque.at(99)).toBe(99)
    })

    it.todo("shrinks when very sparse", () => {
        for (let i = 0; i < 100; i++) deque.pushBack(i)
        for (let i = 0; i < 90; i++) deque.popFront()

        expect(deque.length).toBe(10)
        expect(deque.at(0)).toBe(90)
    })

    it("clear resets to empty state", () => {
        deque.pushBack(1)
        deque.pushBack(2)
        deque.clear()

        expect(deque.length).toBe(0)
        expect(deque.isEmpty()).toBe(true)
        expect(deque.peekFront()).toBeUndefined()
    })

    it("constructor from array works", () => {
        let d = new Deque([10, 20, 30])
        expect([...d]).toEqual([10, 20, 30])
        expect(d.length).toBe(3)
    })
})
