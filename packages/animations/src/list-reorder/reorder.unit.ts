import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeAnimate, type FakeAnimate } from "../_test/fake-animate"
import type { Key } from "../core/types"
import { createListReorder, LIST_REORDER_EASING, LIST_REORDER_EPSILON_PX, LIST_REORDER_MS } from "./reorder"

type FakeNode = {
    style: { transform: string; opacity: string }
    animate: ReturnType<typeof createFakeAnimate>
}

function createFakeEl(): FakeNode {
    return {
        style: { transform: "", opacity: "" },
        animate,
    }
}

let animate = createFakeAnimate()

describe("createListReorder", () => {
    beforeEach(() => {
        animate = createFakeAnimate()
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
        reorder.sync([{ id: "a" }, { id: "b" }])

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

        reorder.sync([{ id: "a" }, { id: "b" }])
        expect(animate).not.toHaveBeenCalled()

        // adjacent swap: a down (move), b up (opacity)
        reorder.sync([{ id: "b" }, { id: "a" }])

        expect(animate).toHaveBeenCalled()

        let moveCalls = animate.mock.calls.filter((call) => {
            let frames = call[0]
            return frames.some((f) => "transform" in f)
        })
        expect(moveCalls.length).toBeGreaterThanOrEqual(1)

        let [keyframes, options] = moveCalls[0]!
        // a: orderDiff = 1 → delta = -1 * itemHeight
        expect(keyframes).toEqual([{ transform: `translateY(${-itemHeight}px)` }, { transform: "translateY(0)" }])
        expect(options).toMatchObject({
            duration: LIST_REORDER_MS,
            easing: LIST_REORDER_EASING,
        })

        // b should fade (opacity)
        let opacityCalls = animate.mock.calls.filter((call) => {
            let frames = call[0]
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
        reorder.sync([{ id: "a" }, { id: "b" }, { id: "c" }])

        expect(() => {
            reorder.sync([{ id: "c" }, { id: "b" }, { id: "a" }])
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
        reorder.sync([{ id: "a" }, { id: "b" }])

        suppressed = true
        reorder.sync([{ id: "b" }, { id: "a" }])
        expect(animate).not.toHaveBeenCalled()

        // baseline should be the suppressed order; next unsuppressed equal order is no-op
        suppressed = false
        reorder.sync([{ id: "b" }, { id: "a" }])
        expect(animate).not.toHaveBeenCalled()
    })

    it("register().destroy() cancels the in-flight animation for that key", () => {
        type Item = { id: string }
        let cancel = vi.fn()
        animate = createFakeAnimate(() => ({
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

        reorder.sync([{ id: "a" }, { id: "b" }])
        reorder.sync([{ id: "b" }, { id: "a" }])

        expect(animate).toHaveBeenCalled()
        handleA.destroy()
        expect(cancel).toHaveBeenCalled()
    })

    it("register().update() cancels the old key animation on recycle", () => {
        type Item = { id: string }
        let cancel = vi.fn()
        animate = createFakeAnimate(function (this: FakeNode, frames, _options) {
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
        } as FakeAnimate)

        let elA = createFakeEl()
        let elB = createFakeEl()

        let reorder = createListReorder<Item>({
            getItemHeight: () => 48,
            getKey: (item) => item.id,
        })

        let handleA = reorder.register(elA as unknown as HTMLElement, "a")
        reorder.register(elB as unknown as HTMLElement, "b")

        reorder.sync([{ id: "a" }, { id: "b" }])
        reorder.sync([{ id: "b" }, { id: "a" }])

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

    describe("getFromTranslateY", () => {
        type Item = { id: string }
        let itemsABC: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }]
        let itemsBCA: Item[] = [{ id: "b" }, { id: "c" }, { id: "a" }]

        let isOverlayFrames = (frames: Keyframe[], px: number): boolean => {
            return (
                frames.length >= 2 &&
                frames[0]?.transform === `translateY(${px}px)` &&
                frames[1]?.transform === "translateY(0)"
            )
        }

        it("FLIPs key a from getFromTranslateY 80px, not index delta; sibling keeps index FLIP", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            expect(animate).not.toHaveBeenCalled()
            overlayPx = 80
            reorder.sync(itemsBCA)

            let overlayCalls = animate.mock.calls.filter((call) => isOverlayFrames(call[0], 80))
            expect(overlayCalls.length).toBe(1)
            expect(overlayCalls[0]![1]).toMatchObject({
                duration: LIST_REORDER_MS,
                easing: LIST_REORDER_EASING,
            })

            // a would have been opacity under classify (majority-up); override must not fade it
            expect(animate.mock.calls.some((call) => call[0].some((f) => "opacity" in f))).toBe(false)
            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], -80))).toBe(false)

            let siblingClassify = animate.mock.calls.filter((call) => {
                let first = call[0][0]
                return !(first && first.transform === "translateY(80px)")
            })
            expect(siblingClassify.length).toBeGreaterThanOrEqual(1)
        })

        it("one-shot fromTranslateY map wins over getFromTranslateY for that sync", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            overlayPx = 80
            // 99 avoids colliding with sibling index delta (±40 / ±80)
            reorder.sync(itemsBCA, { fromTranslateY: new Map<Key, number>([["a", 99]]) })

            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], 99))).toBe(true)
            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], 80))).toBe(false)
        })

        it("map has(key) does not fall back to the callback when the map value is sub-epsilon", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            overlayPx = 80
            reorder.sync(itemsBCA, { fromTranslateY: new Map<Key, number>([["a", 0]]) })

            // map has(a)=0 → no callback fallback; ABC→BCA classifies a as opacity
            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], 80))).toBe(false)
            expect(animate.mock.calls.some((call) => call[0].some((f) => "opacity" in f))).toBe(true)
        })

        it("skips override when suppressed and still advances baseline", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let suppressed = false
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                isSuppressed: () => suppressed,
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            expect(animate).not.toHaveBeenCalled()

            overlayPx = 80
            suppressed = true
            reorder.sync(itemsBCA)
            expect(animate).not.toHaveBeenCalled()

            // baseline advanced to BCA; clear overlay so equal sync proves index path is quiet
            overlayPx = undefined
            suppressed = false
            reorder.sync(itemsBCA)
            expect(animate).not.toHaveBeenCalled()
        })

        it("skips override when reduced and drops baseline", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let reduced = false
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                isReduced: () => reduced,
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            expect(animate).not.toHaveBeenCalled()

            overlayPx = 80
            reduced = true
            reorder.sync(itemsBCA)
            expect(animate).not.toHaveBeenCalled()

            // fresh baseline after drop — clear getter so first sync does not overlay
            overlayPx = undefined
            reduced = false
            reorder.sync(itemsBCA)
            expect(animate).not.toHaveBeenCalled()

            reorder.sync(itemsABC)
            expect(animate).toHaveBeenCalled()
            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], 80))).toBe(false)
            expect(
                animate.mock.calls.some((call) => {
                    let frames = call[0]
                    return frames.some((f) => "transform" in f || "opacity" in f)
                }),
            ).toBe(true)
        })

        it("skips override when disabled and drops baseline", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let enabled = true
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                isEnabled: () => enabled,
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            expect(animate).not.toHaveBeenCalled()

            overlayPx = 80
            enabled = false
            reorder.sync(itemsBCA)
            expect(animate).not.toHaveBeenCalled()

            overlayPx = undefined
            enabled = true
            reorder.sync(itemsBCA)
            expect(animate).not.toHaveBeenCalled()

            reorder.sync(itemsABC)
            expect(animate).toHaveBeenCalled()
            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], 80))).toBe(false)
            expect(
                animate.mock.calls.some((call) => {
                    let frames = call[0]
                    return frames.some((f) => "transform" in f || "opacity" in f)
                }),
            ).toBe(true)
        })

        it("skips non-finite and |px| <= EPSILON, then uses index FLIP", () => {
            let cases: number[] = [NaN, Infinity, LIST_REORDER_EPSILON_PX, 0]
            for (let badPx of cases) {
                animate = createFakeAnimate()
                let elA = createFakeEl()
                let elB = createFakeEl()
                let elC = createFakeEl()
                let reorder = createListReorder<Item>({
                    getItemHeight: () => 40,
                    getKey: (item) => item.id,
                    getFromTranslateY: (key) => (key === "a" ? badPx : undefined),
                })
                reorder.register(elA as unknown as HTMLElement, "a")
                reorder.register(elB as unknown as HTMLElement, "b")
                reorder.register(elC as unknown as HTMLElement, "c")
                reorder.sync(itemsABC)
                reorder.sync(itemsBCA)

                expect(
                    Number.isFinite(badPx) && animate.mock.calls.some((call) => isOverlayFrames(call[0], badPx)),
                ).toBe(false)
                // ABC→BCA: a is opacity under classify; siblings still get index transform
                expect(animate.mock.calls.some((call) => call[0].some((f) => "opacity" in f))).toBe(true)
                expect(
                    animate.mock.calls.some((call) => {
                        let first = call[0][0]
                        return typeof first?.transform === "string" && first.transform !== `translateY(${badPx}px)`
                    }),
                ).toBe(true)
            }
        })
        it("plays override when |px| is just above EPSILON", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let px: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                getFromTranslateY: (key) => (key === "a" ? px : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            px = 1.1
            reorder.sync(itemsBCA)

            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], px))).toBe(true)
        })

        it("plays override on first sync and when order is unchanged", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                getFromTranslateY: (key) => (key === "a" ? 80 : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")

            reorder.sync(itemsABC)
            expect(animate.mock.calls.filter((call) => isOverlayFrames(call[0], 80)).length).toBe(1)

            animate.mockClear()
            reorder.sync(itemsABC)
            expect(animate.mock.calls.filter((call) => isOverlayFrames(call[0], 80)).length).toBe(1)
        })

        it("override skips classify even when the key would be opacity", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 48,
                getKey: (item) => item.id,
                getFromTranslateY: (key) => (key === "b" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.sync([{ id: "a" }, { id: "b" }])
            expect(animate).not.toHaveBeenCalled()

            overlayPx = 80
            reorder.sync([{ id: "b" }, { id: "a" }])

            let bOverlay = animate.mock.calls.filter((call) => isOverlayFrames(call[0], 80))
            expect(bOverlay.length).toBe(1)

            let bOpacity = animate.mock.calls.filter((call) => {
                let frames = call[0]
                return frames.some((f) => "opacity" in f)
            })
            expect(bOpacity.length).toBe(0)
        })

        it("unregistered keys in the one-shot map do not throw", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)

            expect(() => {
                reorder.sync(itemsBCA, {
                    fromTranslateY: new Map<Key, number>([
                        ["missing", 80],
                        ["a", 80],
                    ]),
                })
            }).not.toThrow()
        })

        it("override uses controller durationMs and easing", () => {
            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                durationMs: 40,
                easing: "linear",
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            overlayPx = 80
            reorder.sync(itemsBCA)

            let overlay = animate.mock.calls.find((call) => isOverlayFrames(call[0], 80))
            expect(overlay).toBeDefined()
            expect(overlay![1]).toMatchObject({ duration: 40, easing: "linear" })
        })

        it("override cancels the in-flight animation tracked for that key", () => {
            let cancel = vi.fn()
            animate = createFakeAnimate(() => ({
                finished: new Promise<void>(() => {}),
                cancel,
            }))

            let elA = createFakeEl()
            let elB = createFakeEl()
            let elC = createFakeEl()
            let overlayPx: number | undefined
            let reorder = createListReorder<Item>({
                getItemHeight: () => 40,
                getKey: (item) => item.id,
                getFromTranslateY: (key) => (key === "a" ? overlayPx : undefined),
            })
            reorder.register(elA as unknown as HTMLElement, "a")
            reorder.register(elB as unknown as HTMLElement, "b")
            reorder.register(elC as unknown as HTMLElement, "c")
            reorder.sync(itemsABC)
            reorder.sync(itemsBCA)
            expect(animate).toHaveBeenCalled()
            expect(cancel).not.toHaveBeenCalled()

            animate.mockClear()
            overlayPx = 80
            reorder.sync(itemsBCA)

            expect(cancel).toHaveBeenCalled()
            expect(animate.mock.calls.some((call) => isOverlayFrames(call[0], 80))).toBe(true)
        })
    })
})
