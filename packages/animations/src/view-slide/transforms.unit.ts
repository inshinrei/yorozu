import { describe, expect, it } from "vitest"
import { slideDirectionByIndex, viewSlideTransforms } from "./transforms"

describe("slideDirectionByIndex", () => {
    let tabs = [{ id: 1 }, { id: 2 }, { id: 3 }]

    it("returns forward when to index is higher", () => {
        expect(slideDirectionByIndex(1, 3, tabs)).toBe("forward")
    })

    it("returns back when to index is lower", () => {
        expect(slideDirectionByIndex(3, 1, tabs)).toBe("back")
    })

    it("returns null for the same id", () => {
        expect(slideDirectionByIndex(1, 1, tabs)).toBeNull()
    })

    it("returns null for a missing id", () => {
        expect(slideDirectionByIndex(1, 99, tabs)).toBeNull()
        expect(slideDirectionByIndex(99, 3, tabs)).toBeNull()
    })
})

describe("viewSlideTransforms", () => {
    it("push forward fromEnd.transform is translate3d(-100%, 0, 0)", () => {
        let t = viewSlideTransforms("forward", "push")
        expect(t.fromEnd.transform).toBe("translate3d(-100%, 0, 0)")
        expect(t.fromEnd.opacity).toBe("1")
        expect(t.toStart.transform).toBe("translate3d(100%, 0, 0)")
        expect(t.toStart.opacity).toBe("1")
        expect(t.toEnd).toEqual({ transform: "translate3d(0, 0, 0)", opacity: "1" })
    })

    it("push back mirrors the full-width slide", () => {
        let t = viewSlideTransforms("back", "push")
        expect(t.fromEnd.transform).toBe("translate3d(100%, 0, 0)")
        expect(t.toStart.transform).toBe("translate3d(-100%, 0, 0)")
        expect(t.fromEnd.opacity).toBe("1")
        expect(t.toStart.opacity).toBe("1")
    })

    it("crossfade sets leaving opacity to 0", () => {
        let t = viewSlideTransforms("forward", "crossfade")
        expect(t.fromEnd.opacity).toBe("0")
        expect(t.fromEnd.transform).toBe("translate3d(-1.5rem, 0, 0)")
        expect(t.toStart.opacity).toBe("0")
        expect(t.toStart.transform).toBe("translate3d(1.5rem, 0, 0)")
        expect(t.toEnd.opacity).toBe("1")

        let back = viewSlideTransforms("back", "crossfade")
        expect(back.fromEnd.opacity).toBe("0")
        expect(back.fromEnd.transform).toBe("translate3d(1.5rem, 0, 0)")
        expect(back.toStart.transform).toBe("translate3d(-1.5rem, 0, 0)")
    })
})
