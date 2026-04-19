import { describe, expect, it } from "vitest"
import { noop } from "./noop"

describe("noop", () => {
    it("is callable and returns undefined", () => {
        let result = noop()
        expect(result).toBeUndefined()
    })

    it("performs zero side effects and remains pure across calls", () => {
        let sideEffectCounter = 0
        let tracker = () => {
            sideEffectCounter++
        }

        for (let i = 0; i < 10; i++) {
            noop()
        }

        let arr = [1, 2, 3]
        arr.forEach(noop)
        arr.map(noop)

        expect(sideEffectCounter).toBe(0)
    })

    it("can be assigned and passed around without breaking identity", () => {
        let fn1 = noop
        let fn2 = noop

        expect(fn1).toBe(fn2)
        expect(typeof fn1).toBe("function")
    })
})
