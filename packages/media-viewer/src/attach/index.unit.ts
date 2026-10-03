// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import type { MediaVisibleIds } from "../types"
import {
    DecodeFn,
    img,
    imgAspect,
    mockViewportBox,
    mountAttach,
    origin,
    pointer,
    teardownAttach,
    RequestFn,
    type AttachTestMount,
} from "./test-helpers"

function tapViewport(root: HTMLElement): void {
    let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
    viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
    viewport.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 200 }))
    viewport.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 200, clientY: 200 }))
}

describe("attachMediaViewer", () => {
    let viewer: AttachTestMount["viewer"]
    let root: HTMLElement
    let stop: (() => void) | undefined
    let animate: AttachTestMount["animate"]
    let onIndexChange: AttachTestMount["onIndexChange"]

    beforeEach(() => {
        let mount = mountAttach()
        viewer = mount.viewer
        root = mount.root
        stop = mount.stop
        animate = mount.animate
        onIndexChange = mount.onIndexChange
    })

    afterEach(() => {
        teardownAttach({ viewer, root, stop, animate, onIndexChange })
    })

    it("detach removes overlay and stops keys", () => {
        viewer.open({ items: [img("a"), img("b")], index: 0 })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeTruthy()
        stop!()
        stop = undefined
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        expect(viewer.snapshot().index).toBe(0)
        viewer.open({ items: [img("z")] })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
    })

    it("keyboard nav sets data-switch on the strip; swipe does not", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        let strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        expect(strip.getAttribute("data-switch")).toBe("newer")
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
        expect(strip.getAttribute("data-switch")).toBe("older")
        viewer.goTo(2)
        expect(strip.getAttribute("data-switch")).toBe("jump")

        viewer.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 200 }))
        expect(viewer.snapshot().index).toBe(2)
        strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        expect(strip.getAttribute("data-switch")).toBeNull()
    })

    it("pagination-edge swipe requests newer without rebasing the strip", async () => {
        let onRequestNewer = vi.fn<RequestFn>()
        stop?.()
        viewer.destroy()
        viewer = createMediaViewer({ onIndexChange, onRequestNewer })
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [img("a"), img("b")], index: 1, canNewer: true })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 200 }))
        expect(onRequestNewer).toHaveBeenCalledTimes(1)
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.lastNav()).toBe("swipe")
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
        let strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        let tx = Number(/translate3d\(([-\d.]+)px/.exec(strip.style.transform)?.[1] ?? "0")
        expect(Math.abs(tx)).toBeLessThan(500)
        expect(tx).toBeLessThanOrEqual(0)
    })

    it("consecutive same-direction switch restarts animation via reflow", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        let strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        let reads = 0
        Object.defineProperty(strip, "offsetWidth", {
            configurable: true,
            get: () => {
                reads += 1
                return 400
            },
        })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        expect(strip.getAttribute("data-switch")).toBe("newer")
        let firstKey = strip.getAttribute("data-switch-key")
        let afterFirst = reads
        expect(afterFirst).toBeGreaterThan(0)
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        expect(strip.getAttribute("data-switch")).toBe("newer")
        expect(strip.getAttribute("data-switch-key")).not.toBe(firstKey)
        expect(reads).toBeGreaterThan(afterFirst)
    })

    it("onVisible fires on open, index change, and coalesces duplicates", () => {
        let seen: MediaVisibleIds[] = []
        viewer.destroy()
        viewer = createMediaViewer({
            onVisible: (ids) => {
                seen.push({ stage: ids.stage, peeks: [...ids.peeks], thumbs: [...ids.thumbs] })
            },
        })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [img("a"), img("b")], index: 0, filmstrip: false })
        expect(seen[0]).toEqual({ stage: "a", peeks: ["b"], thumbs: [] })
        viewer.next("next")
        expect(seen.at(-1)).toEqual({ stage: "b", peeks: ["a"], thumbs: [] })
        let n = seen.length
        viewer.setNeighbors({
            older: { id: "a", kind: "image", src: "a.jpg" },
            newer: null,
        })
        expect(seen.length).toBe(n)
    })

    it("onVisible after forceClose is empty ids", () => {
        let seen: MediaVisibleIds[] = []
        viewer.destroy()
        viewer = createMediaViewer({
            onVisible: (ids) => {
                seen.push({ stage: ids.stage, peeks: [...ids.peeks], thumbs: [...ids.thumbs] })
            },
        })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [img("a"), img("b")], index: 0, filmstrip: false })
        expect(seen[0]).toEqual({ stage: "a", peeks: ["b"], thumbs: [] })
        viewer.forceClose()
        expect(seen.at(-1)).toEqual({ stage: "", peeks: [], thumbs: [] })
    })

    it("forceClose during swipe-dismiss does not emit live ids after teardown starts", async () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let seen: MediaVisibleIds[] = []
        viewer.destroy()
        viewer = createMediaViewer({
            onVisible: (ids) => {
                seen.push({ stage: ids.stage, peeks: [...ids.peeks], thumbs: [...ids.thumbs] })
            },
        })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [img("a")], filmstrip: false, ghost: false })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 280 }))
        await vi.advanceTimersByTimeAsync(16)
        let n = seen.length
        viewer.forceClose()
        let tail = seen.slice(n)
        expect(tail.filter((ids) => ids.stage !== "")).toEqual([])
        expect(seen.at(-1)).toEqual({ stage: "", peeks: [], thumbs: [] })
    })

    it("onVisible filmstrip on reports all item ids as thumbs", () => {
        let seen: MediaVisibleIds[] = []
        viewer.destroy()
        viewer = createMediaViewer({
            onVisible: (ids) => {
                seen.push({ stage: ids.stage, peeks: [...ids.peeks], thumbs: [...ids.thumbs] })
            },
        })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [img("a"), img("b")], index: 0 })
        expect(seen[0]).toEqual({ stage: "a", peeks: ["b"], thumbs: ["a", "b"] })
        viewer.setNeighbors({
            older: null,
            newer: { id: "x", kind: "image", src: "x.jpg" },
        })
        expect(seen.at(-1)).toEqual({ stage: "a", peeks: ["x"], thumbs: ["a", "b"] })
    })

    it("onVisible virtualized thumbs is a window that includes the current id", () => {
        let seen: MediaVisibleIds[] = []
        viewer.destroy()
        viewer = createMediaViewer({
            onVisible: (ids) => {
                seen.push({ stage: ids.stage, peeks: [...ids.peeks], thumbs: [...ids.thumbs] })
            },
        })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 20,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        viewer.setItems(items, 20)
        let last = seen.at(-1)!
        expect(last.stage).toBe("id-20")
        expect(last.peeks).toEqual(["id-19", "id-21"])
        expect(last.thumbs.length).toBeGreaterThan(0)
        expect(last.thumbs.length).toBeLessThan(40)
        expect(last.thumbs).toContain("id-20")
    })

    it("onVisible virtualized open at index 20 does not emit a prefix-only thumbs window", () => {
        let seen: MediaVisibleIds[] = []
        viewer.destroy()
        viewer = createMediaViewer({
            onVisible: (ids) => {
                seen.push({ stage: ids.stage, peeks: [...ids.peeks], thumbs: [...ids.thumbs] })
            },
        })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 20,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        expect(seen.length).toBeGreaterThan(0)
        let first = seen[0]!
        expect(first.stage).toBe("id-20")
        expect(first.thumbs).toContain("id-20")
        expect(first.thumbs.length).toBeGreaterThan(0)
        expect(first.thumbs.length).toBeLessThan(40)
        const prefixOnly = (ids: string[]): boolean => ids.length > 0 && ids[0] === "id-0" && !ids.includes("id-20")
        expect(seen.some((s) => prefixOnly(s.thumbs))).toBe(false)
    })

    it("onVisible coalesces swipe settle that does not change ids", () => {
        let seen: MediaVisibleIds[] = []
        viewer.destroy()
        viewer = createMediaViewer({
            onVisible: (ids) => {
                seen.push({ stage: ids.stage, peeks: [...ids.peeks], thumbs: [...ids.thumbs] })
            },
        })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [img("a"), img("b")], index: 0, filmstrip: false })
        expect(seen[0]).toEqual({ stage: "a", peeks: ["b"], thumbs: [] })
        let n = seen.length
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 200 }))
        expect(seen.at(-1)).toEqual({ stage: "a", peeks: ["b"], thumbs: [] })
        expect(seen.filter((s) => s.stage === "a" && s.peeks[0] === "b")).toHaveLength(n)
    })

    it("viewport click hides chrome and a second click shows it", () => {
        viewer.open({
            items: [img("a"), img("b")],
            chrome: {
                header: (el) => {
                    let btn = document.createElement("button")
                    btn.id = "hdr"
                    el.append(btn)
                },
            },
        })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(overlay.getAttribute("data-phase")).toBe("open")
        tapViewport(root)
        expect(overlay.getAttribute("data-chrome")).toBe("hidden")
        expect(root.querySelector("[data-yorozu-media-header]")?.getAttribute("aria-hidden")).toBe("true")
        expect(root.querySelector("[data-yorozu-media-filmstrip-clip]")?.getAttribute("aria-hidden")).toBe("true")
        tapViewport(root)
        expect(overlay.hasAttribute("data-chrome")).toBe(false)
        expect(root.querySelector("[data-yorozu-media-header]")?.hasAttribute("aria-hidden")).toBe(false)
    })

    it("header button click does not toggle chrome", () => {
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (el) => {
                    let btn = document.createElement("button")
                    btn.id = "hdr"
                    el.append(btn)
                },
            },
        })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        root.querySelector("#hdr")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        expect(overlay.hasAttribute("data-chrome")).toBe(false)
    })

    it("filmstrip thumb click does not toggle chrome", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let thumb = root.querySelector('[data-yorozu-media-thumb][data-index="1"]') as HTMLElement
        thumb.click()
        expect(overlay.hasAttribute("data-chrome")).toBe(false)
        expect(viewer.snapshot().index).toBe(1)
    })

    it("pointer move past 10px then click does not toggle chrome", () => {
        viewer.open({ items: [img("a")] })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 220, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 220, clientY: 200 }))
        viewport.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 220, clientY: 200 }))
        expect(overlay.hasAttribute("data-chrome")).toBe(false)
    })

    it("horizontal swipe does not hide chrome", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 400, 400)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 300, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 220, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 220, clientY: 200 }))
        viewport.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 220, clientY: 200 }))
        expect(overlay.hasAttribute("data-chrome")).toBe(false)
        expect(viewer.snapshot().index).toBe(2)
    })

    it("reopen starts with chrome shown", () => {
        viewer.open({ items: [img("a")], ghost: false })
        tapViewport(root)
        expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-chrome")).toBe("hidden")
        viewer.close()
        viewer.open({ items: [img("b")], ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")?.hasAttribute("data-chrome")).toBe(false)
    })

    it("does not toggle chrome while opening", () => {
        viewer.open({
            items: [img("a")],
            origin,
            chrome: { header: (el) => el.append(document.createElement("button")) },
        })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(overlay.getAttribute("data-phase")).toBe("opening")
        tapViewport(root)
        expect(overlay.hasAttribute("data-chrome")).toBe(false)
    })
})
