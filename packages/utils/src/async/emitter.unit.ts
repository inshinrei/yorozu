import { beforeEach, describe, expect, it, vi } from "vitest"
import { Emitter } from "./emitter"
import { NoneToVoidFunction } from "../types"

describe("Emitter", () => {
    let emitter: Emitter<number>
    let spy1: NoneToVoidFunction
    let spy2: NoneToVoidFunction
    let spy3: NoneToVoidFunction

    beforeEach(() => {
        emitter = new Emitter<number>()
        spy1 = vi.fn()
        spy2 = vi.fn()
        spy3 = vi.fn()
    })

    it("starts with length 0 and does nothing on emit", () => {
        emitter.emit(42)
        expect(emitter.length).toBe(0)
    })

    it("add() increases length and switches emit strategy", () => {
        emitter.add(spy1)
        expect(emitter.length).toBe(1)

        emitter.emit(100)
        expect(spy1).toHaveBeenCalledTimes(1)
        expect(spy1).toHaveBeenCalledWith(100)
    })

    it("uses direct-call strategy for exactly 1 listener", () => {
        emitter.add(spy1)
        emitter.emit(1)
        expect(spy1).toHaveBeenCalledTimes(1)
    })

    it("uses #emitFew (unrolled) strategy for 2-5 listeners", () => {
        emitter.add(spy1)
        emitter.add(spy2)
        emitter.add(spy3)

        emitter.emit(999)

        expect(spy1).toHaveBeenCalledWith(999)
        expect(spy2).toHaveBeenCalledWith(999)
        expect(spy3).toHaveBeenCalledWith(999)
    })

    it("uses #emitAll (loop) strategy for 6+ listeners", () => {
        let spies = Array.from({ length: 7 }, () => vi.fn())
        for (let spy of spies) emitter.add(spy)
        emitter.emit(777)
        for (let spy of spies) expect(spy).toHaveBeenCalledWith(777)
    })

    it("remove() decreases length and updates emit strategy correctly", () => {
        emitter.add(spy1)
        emitter.add(spy2)

        emitter.remove(spy1)

        expect(emitter.length).toBe(1)

        emitter.emit(555)
        expect(spy1).toHaveBeenCalledTimes(0)
        expect(spy2).toHaveBeenCalledTimes(1)
        expect(spy2).toHaveBeenCalledWith(555)
    })

    it("remove() of non-existent listener is a safe no-op", () => {
        emitter.add(spy1)
        emitter.remove(spy2)
        expect(emitter.length).toBe(1)
    })

    it("once() registers listener that auto-removes itself after first emit", () => {
        emitter.once(spy1)

        emitter.emit(10)
        emitter.emit(20)

        expect(spy1).toHaveBeenCalledTimes(1)
        expect(spy1).toHaveBeenCalledWith(10)
        expect(emitter.length).toBe(0)
    })

    it("forwardTo() correctly forwards all emissions", () => {
        let target = new Emitter<number>()
        let targetSpy = vi.fn()
        target.add(targetSpy)

        emitter.forwardTo(target)

        emitter.emit(123)
        expect(targetSpy).toHaveBeenCalledWith(123)
        expect(emitter.length).toBe(1)
    })

    it("clear() resets everything to initial state", () => {
        emitter.add(spy1)
        emitter.add(spy2)
        emitter.once(spy3)

        emitter.clear()

        expect(emitter.length).toBe(0)
        emitter.emit(999)
        expect(spy1).toHaveBeenCalledTimes(0)
        expect(spy2).toHaveBeenCalledTimes(0)
        expect(spy3).toHaveBeenCalledTimes(0)
    })

    it("supports complex mix: add, remove, forwardTo", () => {
        let target = new Emitter<number>()
        let targetSpy = vi.fn()
        target.add(targetSpy)

        emitter.add(spy1)
        emitter.forwardTo(target)

        emitter.emit(42)

        expect(spy1).toHaveBeenCalledWith(42)
        expect(targetSpy).toHaveBeenCalledWith(42)
        expect(emitter.length).toBe(2)

        emitter.remove(spy1)
        expect(emitter.length).toBe(1)

        emitter.clear()
        expect(emitter.length).toBe(0)
    })
})
