import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeAnimate } from "../_test/fake-animate"
import { MOTION_SETTLE_MS, MOTION_SPRING_EASE } from "../core/motion-timing"
import { createListShift, LIST_SHIFT_EASING, LIST_SHIFT_EPSILON_PX, LIST_SHIFT_MS } from "./shift"

function rect(
    top: number,
    height = 40,
): {
    top: number
    left: number
    width: number
    height: number
    bottom: number
    right: number
    x: number
    y: number
    toJSON: () => Record<string, never>
} {
    return {
        top,
        left: 0,
        width: 100,
        height,
        bottom: top + height,
        right: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
    }
}

function translateYPx(transform: string): number {
    let match = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(transform)
    return match ? Number(match[1]) : 0
}

type FakeNode = {
    style: { transform: string }
    animate: ReturnType<typeof createFakeAnimate>
    top: number
    height: number
    getBoundingClientRect: () => ReturnType<typeof rect>
}

function createFakeEl(top: number, height = 40): FakeNode {
    let node: FakeNode = {
        style: { transform: "" },
        animate: createFakeAnimate(),
        top,
        height,
        getBoundingClientRect: () => rect(node.top + translateYPx(node.style.transform), node.height),
    }
    return node
}

type Observed = {
    callback: ResizeObserverCallback
    targets: Set<unknown>
    observe: ReturnType<typeof vi.fn>
    unobserve: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
}

let observerRecords: Observed[] = []
let ResizeObserverMock: ReturnType<typeof vi.fn>
let rootTop = 0
let root: HTMLElement

function fireResize(el: unknown): void {
    for (let rec of observerRecords) {
        if (rec.targets.has(el)) {
            rec.callback([] as unknown as ResizeObserverEntry[], rec as unknown as ResizeObserver)
        }
    }
}

describe("createListShift", () => {
    beforeEach(() => {
        observerRecords = []
        rootTop = 0
        root = {
            getBoundingClientRect: () => rect(rootTop, 400),
        } as unknown as HTMLElement
        ResizeObserverMock = vi.fn(function (
            this: {
                observe: Observed["observe"]
                unobserve: Observed["unobserve"]
                disconnect: Observed["disconnect"]
            },
            cb: ResizeObserverCallback,
        ) {
            let rec: Observed = {
                callback: cb,
                targets: new Set(),
                observe: vi.fn((target: unknown) => {
                    rec.targets.add(target)
                }),
                unobserve: vi.fn((target: unknown) => {
                    rec.targets.delete(target)
                }),
                disconnect: vi.fn(() => {
                    rec.targets.clear()
                }),
            }
            observerRecords.push(rec)
            this.observe = rec.observe
            this.unobserve = rec.unobserve
            this.disconnect = rec.disconnect
        })
        vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("exports LIST_SHIFT_MS as MOTION_SETTLE_MS and spring easing", () => {
        expect(LIST_SHIFT_MS).toBe(MOTION_SETTLE_MS)
        expect(LIST_SHIFT_EASING).toBe(MOTION_SPRING_EASE)
        expect(LIST_SHIFT_EPSILON_PX).toBe(1)
    })

    it("snapshot then play inverts translateY on keys that moved", () => {
        let a = createFakeEl(0)
        let b = createFakeEl(40)
        let shift = createListShift({ root })
        shift.register(a as unknown as HTMLElement, "a")
        shift.register(b as unknown as HTMLElement, "b")
        shift.snapshot()
        a.top = -40
        b.top = 0
        shift.play()
        expect(a.animate).toHaveBeenCalledWith([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }], {
            duration: LIST_SHIFT_MS,
            easing: LIST_SHIFT_EASING,
        })
        expect(b.animate).toHaveBeenCalledWith([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }], {
            duration: LIST_SHIFT_MS,
            easing: LIST_SHIFT_EASING,
        })
        shift.destroy()
    })

    it("new keys with no lastTop are not inverted", () => {
        let a = createFakeEl(0)
        let c = createFakeEl(80)
        let shift = createListShift({ root })
        shift.register(a as unknown as HTMLElement, "a")
        shift.snapshot()
        a.top = -40
        shift.register(c as unknown as HTMLElement, "c")
        shift.play()
        expect(a.animate).toHaveBeenCalled()
        expect(c.animate).not.toHaveBeenCalled()
        shift.destroy()
    })

    it("removed keys are dropped and remaining invert", () => {
        let a = createFakeEl(0)
        let b = createFakeEl(40)
        let shift = createListShift({ root })
        let handleA = shift.register(a as unknown as HTMLElement, "a")
        shift.register(b as unknown as HTMLElement, "b")
        shift.snapshot()
        handleA.destroy()
        b.top = 0
        shift.play()
        expect(a.animate).not.toHaveBeenCalled()
        expect(b.animate).toHaveBeenCalledWith([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }], {
            duration: LIST_SHIFT_MS,
            easing: LIST_SHIFT_EASING,
        })
        expect(b.animate).toHaveBeenCalledTimes(1)
        shift.destroy()
    })

    it("duration 0 rebases without WAAPI", () => {
        let a = createFakeEl(0)
        let shift = createListShift({ root })
        shift.register(a as unknown as HTMLElement, "a")
        shift.snapshot()
        a.top = -40
        shift.play({ durationMs: 0 })
        expect(a.animate).not.toHaveBeenCalled()
        shift.play()
        expect(a.animate).not.toHaveBeenCalled()
        shift.destroy()
    })

    it("isEnabled false rebases without WAAPI", () => {
        let a = createFakeEl(0)
        let shift = createListShift({ root, isEnabled: () => false })
        shift.register(a as unknown as HTMLElement, "a")
        shift.snapshot()
        a.top = -40
        shift.play()
        expect(a.animate).not.toHaveBeenCalled()
        shift.destroy()
    })

    it("auto play when a registered row observer fires", () => {
        let a = createFakeEl(0)
        let b = createFakeEl(40)
        let shift = createListShift({ root })
        shift.register(a as unknown as HTMLElement, "a")
        shift.register(b as unknown as HTMLElement, "b")
        a.height = 72
        b.top = 72
        fireResize(a)
        expect(a.animate).not.toHaveBeenCalled()
        expect(b.animate).toHaveBeenCalledWith([{ transform: "translateY(-32px)" }, { transform: "translateY(0)" }], {
            duration: LIST_SHIFT_MS,
            easing: LIST_SHIFT_EASING,
        })
        shift.destroy()
    })

    it("rebases lastTop to layout Last, not the inverted translateY box", async () => {
        let a = createFakeEl(0)
        let b = createFakeEl(40)
        let finishB!: () => void
        let finishedB!: Promise<void>
        b.animate = createFakeAnimate((frames) => {
            let first = frames[0]
            if (first && typeof first.transform === "string") {
                b.style.transform = first.transform
            }
            finishedB = new Promise<void>((resolve) => {
                finishB = (): void => {
                    b.style.transform = ""
                    resolve()
                }
            })
            return {
                finished: finishedB,
                cancel: (): void => {
                    b.style.transform = ""
                },
            }
        })
        let shift = createListShift({ root })
        shift.register(a as unknown as HTMLElement, "a")
        shift.register(b as unknown as HTMLElement, "b")
        a.height = 72
        b.top = 72
        fireResize(a)
        expect(b.animate).toHaveBeenCalledTimes(1)
        expect(b.animate).toHaveBeenCalledWith([{ transform: "translateY(-32px)" }, { transform: "translateY(0)" }], {
            duration: LIST_SHIFT_MS,
            easing: LIST_SHIFT_EASING,
        })
        expect(b.getBoundingClientRect().top).toBe(40)
        finishB()
        await finishedB
        fireResize(a)
        expect(b.animate).toHaveBeenCalledTimes(1)
        shift.destroy()
    })

    it("relative top subtracts the root rect", () => {
        rootTop = 100
        let a = createFakeEl(100)
        let shift = createListShift({ root })
        shift.register(a as unknown as HTMLElement, "a")
        shift.snapshot()
        a.top = 60
        shift.play()
        expect(a.animate).toHaveBeenCalledWith([{ transform: "translateY(40px)" }, { transform: "translateY(0)" }], {
            duration: LIST_SHIFT_MS,
            easing: LIST_SHIFT_EASING,
        })
        shift.destroy()
    })
})
