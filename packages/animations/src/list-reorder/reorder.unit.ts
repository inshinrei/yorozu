import { beforeEach, describe, expect, it, vi } from "vitest"
import {
    createListReorder,
    LIST_REORDER_EASING,
    LIST_REORDER_MS,
} from "./reorder"

type FakeNode = {
    style: { transform: string; opacity: string }
    animate: ReturnType<typeof vi.fn>
}

function createFakeEl(): FakeNode {
    return {
        style: { transform: "", opacity: "" },
        animate,
    }
}

let animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
}))

describe("createListReorder", () => {
    beforeEach(() => {
        animate = vi.fn(() => ({
            finished: Promise.resolve(),
            cancel: vi.fn(),
        }))
    })

    it("exports default timing constants", () => {
        expect(LIST_REORDER_MS).toBe(200)
        expect(LIST_REORDER_EASING).toBe("ease-out")
    })

    it("first sync does not animate", () => {
        type Item = { id: string }
        let elA = createFakeEl()
        let elB = createFakeEl()

        let reorder = createListReorder<Item>({
            getItemHeight: () => 48,
            getKey: (item) => item.id,
        })

        reorder.register(elA as unknown as HTMLElement, "a")
        reorder.register(elB as unknown as HTMLElement, "b")
        reorder.sync([
            { id: "a" },
            { id: "b" },
        ])

        expect(animate).not.toHaveBeenCalled()
    })

    it("second sync with a swapped pair calls animate on the majority-move row with translateY", () => {
        type Item = { id: string }
        let elA = createFakeEl()
        let elB = createFakeEl()
        let itemHeight = 48

        let reorder = createListReorder<Item>({
            getItemHeight: () => itemHeight,
            getKey: (item) => item.id,
        })

        reorder.register(elA as unknown as HTMLElement, "a")
        reorder.register(elB as unknown as HTMLElement, "b")

        reorder.sync([
            { id: "a" },
            { id: "b" },
        ])
        expect(animate).not.toHaveBeenCalled()

        // adjacent swap: a down (move), b up (opacity)
        reorder.sync([
            { id: "b" },
            { id: "a" },
        ])

        expect(animate).toHaveBeenCalled()

        let moveCalls = animate.mock.calls.filter((call) => {
            let frames = call[0] as Keyframe[]
            return frames.some((f) => "transform" in f)
        })
        expect(moveCalls.length).toBeGreaterThanOrEqual(1)

        let [keyframes, options] = moveCalls[0]!
        // a: orderDiff = 1 → delta = -1 * itemHeight
        expect(keyframes).toEqual([
            { transform: `translateY(${-itemHeight}px)` },
            { transform: "translateY(0)" },
        ])
        expect(options).toMatchObject({
            duration: LIST_REORDER_MS,
            easing: LIST_REORDER_EASING,
        })

        // b should fade (opacity)
        let opacityCalls = animate.mock.calls.filter((call) => {
            let frames = call[0] as Keyframe[]
            return frames.some((f) => "opacity" in f)
        })
        expect(opacityCalls.length).toBe(1)
        expect(opacityCalls[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }])
    })

    it("unregistered keys (off-window) do not throw", () => {
        type Item = { id: string }
        let elA = createFakeEl()

        let reorder = createListReorder<Item>({
            getItemHeight: () => 40,
            getKey: (item) => item.id,
        })

        reorder.register(elA as unknown as HTMLElement, "a")
        reorder.sync([
            { id: "a" },
            { id: "b" },
            { id: "c" },
        ])

        expect(() => {
            reorder.sync([
                { id: "c" },
                { id: "b" },
                { id: "a" },
            ])
        }).not.toThrow()
    })

    it("isSuppressed updates baseline without animate", () => {
        type Item = { id: string }
        let elA = createFakeEl()
        let elB = createFakeEl()
        let suppressed = false

        let reorder = createListReorder<Item>({
            getItemHeight: () => 48,
            getKey: (item) => item.id,
            isSuppressed: () => suppressed,
        })

        reorder.register(elA as unknown as HTMLElement, "a")
        reorder.register(elB as unknown as HTMLElement, "b")
        reorder.sync([
            { id: "a" },
            { id: "b" },
        ])

        suppressed = true
        reorder.sync([
            { id: "b" },
            { id: "a" },
        ])
        expect(animate).not.toHaveBeenCalled()

        // baseline should be the suppressed order; next unsuppressed equal order is no-op
        suppressed = false
        reorder.sync([
            { id: "b" },
            { id: "a" },
        ])
        expect(animate).not.toHaveBeenCalled()
    })

    it("register().destroy() cancels the in-flight animation for that key", () => {
        type Item = { id: string }
        let cancel = vi.fn()
        animate = vi.fn(() => ({
            finished: new Promise<void>(() => {}),
            cancel,
        }))

        let elA = createFakeEl()
        let elB = createFakeEl()

        let reorder = createListReorder<Item>({
            getItemHeight: () => 48,
            getKey: (item) => item.id,
        })

        let handleA = reorder.register(elA as unknown as HTMLElement, "a")
        reorder.register(elB as unknown as HTMLElement, "b")

        reorder.sync([
            { id: "a" },
            { id: "b" },
        ])
        reorder.sync([
            { id: "b" },
            { id: "a" },
        ])

        expect(animate).toHaveBeenCalled()
        handleA.destroy()
        expect(cancel).toHaveBeenCalled()
    })

    it("register().update() cancels the old key animation on recycle", () => {
        type Item = { id: string }
        let cancel = vi.fn()
        animate = vi.fn(function (this: FakeNode, frames: Keyframe[]) {
            let first = frames[0]
            if (first && typeof first.transform === "string") {
                this.style.transform = first.transform
            }
            return {
                finished: new Promise<void>(() => {}),
                cancel: () => {
                    this.style.transform = ""
                    cancel()
                },
            }
        })

        let elA = createFakeEl()
        let elB = createFakeEl()

        let reorder = createListReorder<Item>({
            getItemHeight: () => 48,
            getKey: (item) => item.id,
        })

        let handleA = reorder.register(elA as unknown as HTMLElement, "a")
        reorder.register(elB as unknown as HTMLElement, "b")

        reorder.sync([
            { id: "a" },
            { id: "b" },
        ])
        reorder.sync([
            { id: "b" },
            { id: "a" },
        ])

        expect(animate).toHaveBeenCalled()
        expect(elA.style.transform).toBe("translateY(-48px)")

        handleA.update("c")
        expect(cancel).toHaveBeenCalled()
        expect(elA.style.transform).toBe("")
    })

    it("register after destroy is a no-op", () => {
        type Item = { id: string }
        let elA = createFakeEl()

        let reorder = createListReorder<Item>({
            getItemHeight: () => 48,
            getKey: (item) => item.id,
        })

        reorder.destroy()
        let handle = reorder.register(elA as unknown as HTMLElement, "a")
        reorder.sync([{ id: "a" }])
        handle.update("b")
        expect(animate).not.toHaveBeenCalled()
    })
})
