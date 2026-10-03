// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import {
    filmstripCentersScrollLeft,
    filmstripCurrentWidthPx,
    filmstripEndInsetPx,
    filmstripGapAfter,
    filmstripThumbPitchPx,
} from "../filmstrip"
import type { MediaViewerChromeApi } from "../types"
import {
    DecodeFn,
    img,
    imgAspect,
    mountAttach,
    origin,
    pointer,
    teardownAttach,
    flushLiveRaf,
    mockViewportBox,
    type AttachTestMount,
} from "./test-helpers"

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

    it("two items paint a filmstrip sibling of footer; one item does not", () => {
        viewer.open({ items: [img("a")] })
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBeNull()
        viewer.open({ items: [img("a"), img("b")] })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let footer = root.querySelector("[data-yorozu-media-footer]") as HTMLElement
        expect(nav).toBeTruthy()
        expect(nav.getAttribute("role")).toBe("navigation")
        expect(nav.getAttribute("aria-label")).toBe("Gallery items")
        expect(nav.parentElement?.hasAttribute("data-yorozu-media-filmstrip-clip")).toBe(true)
        expect(nav.parentElement?.parentElement).toBe(footer.parentElement)
        expect(root.querySelector("[data-yorozu-media-viewport] [data-yorozu-media-filmstrip]")).toBeNull()
        let track = nav.querySelector('[role="list"]') as HTMLElement
        expect(track).toBeTruthy()
        let thumbs = [...nav.querySelectorAll("[data-yorozu-media-thumb]")] as HTMLButtonElement[]
        expect(thumbs).toHaveLength(2)
        expect(thumbs[0]!.tagName).toBe("BUTTON")
        expect(thumbs[0]!.getAttribute("data-index")).toBe("0")
        expect(thumbs[0]!.getAttribute("aria-current")).toBe("true")
        expect(thumbs[0]!.getAttribute("data-current")).toBe("")
        expect(thumbs[0]!.disabled).toBe(true)
        expect(thumbs[1]!.getAttribute("data-index")).toBe("1")
        expect(thumbs[1]!.hasAttribute("data-current")).toBe(false)
        expect(thumbs[1]!.disabled).toBe(false)
        expect(thumbs[0]!.querySelector("img")?.getAttribute("src")).toBe("a.jpg")
    })

    it("open({ filmstrip: false }) does not paint the filmstrip; host footer still mounts", () => {
        viewer.open({
            items: [img("a"), img("b")],
            filmstrip: false,
            chrome: {
                footer: (el) => {
                    el.textContent = "host-footer"
                },
            },
        })
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-footer]")?.textContent).toBe("host-footer")
    })

    it("clicking a thumb calls goTo for that index", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        let thumb = root.querySelector('[data-yorozu-media-thumb][data-index="1"]') as HTMLButtonElement
        thumb.click()
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.lastNav()).toBe("jump")
        expect(onIndexChange).toHaveBeenCalledTimes(1)
        let current = root.querySelector("[data-yorozu-media-thumb][data-current]") as HTMLButtonElement
        expect(current.getAttribute("data-index")).toBe("1")
        expect(current.disabled).toBe(true)
    })

    it("video thumbs get data-yorozu-media-thumb-video and use poster or src as img", () => {
        viewer.open({
            items: [
                img("a"),
                { id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" },
                { id: "w", kind: "video", src: "w.mp4" },
                { id: "empty", kind: "image" },
            ],
        })
        let videoPoster = root.querySelector('[data-yorozu-media-thumb][data-index="1"]') as HTMLButtonElement
        expect(videoPoster.hasAttribute("data-yorozu-media-thumb-video")).toBe(true)
        expect(videoPoster.querySelector("img")?.getAttribute("src")).toBe("p.jpg")
        let videoSrc = root.querySelector('[data-yorozu-media-thumb][data-index="2"]') as HTMLButtonElement
        expect(videoSrc.hasAttribute("data-yorozu-media-thumb-video")).toBe(true)
        expect(videoSrc.querySelector("img")?.getAttribute("src")).toBe("w.mp4")
        let missing = root.querySelector('[data-yorozu-media-thumb][data-index="3"]') as HTMLButtonElement
        expect(missing.hasAttribute("data-yorozu-media-thumb-video")).toBe(false)
        expect(missing.querySelector("[data-yorozu-media-loading]")).toBeTruthy()
        expect(
            root
                .querySelector('[data-yorozu-media-thumb][data-index="0"]')
                ?.hasAttribute("data-yorozu-media-thumb-video"),
        ).toBe(false)
    })

    it("setFilmstrip(false) removes the filmstrip node; setFilmstrip(true) paints it again", () => {
        viewer.open({ items: [img("a"), img("b")] })
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBeTruthy()
        viewer.setFilmstrip(false)
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-footer]")).toBeTruthy()
        viewer.setFilmstrip(true)
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBeTruthy()
    })

    it("same item ids update data-current without remounting the nav; id changes rebuild thumbs", () => {
        viewer.open({ items: [img("a"), img("b")], index: 0 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let first = root.querySelector('[data-yorozu-media-thumb][data-index="0"]') as HTMLButtonElement
        viewer.goTo(1)
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBe(nav)
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="0"]')).toBe(first)
        expect(first.hasAttribute("data-current")).toBe(false)
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="1"]')?.hasAttribute("data-current")).toBe(true)
        viewer.setItems([img("a"), img("b")], 0)
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBe(nav)
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="0"]')).toBe(first)
        expect(first.hasAttribute("data-current")).toBe(true)
        viewer.setItems([img("x"), img("y")])
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).toBe(nav)
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="0"]')).not.toBe(first)
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="0"] img')?.getAttribute("src")).toBe("x.jpg")
        viewer.open({ items: [img("p"), img("q")] })
        expect(root.querySelector("[data-yorozu-media-filmstrip]")).not.toBe(nav)
    })

    it("same-id setItems with urls replaces loading thumbs with img in place", () => {
        viewer.open({
            items: [
                { id: "a", kind: "image", src: null },
                { id: "b", kind: "image", src: null },
            ],
        })
        let first = root.querySelector('[data-yorozu-media-thumb][data-index="0"]') as HTMLButtonElement
        let second = root.querySelector('[data-yorozu-media-thumb][data-index="1"]') as HTMLButtonElement
        expect(first.querySelector("[data-yorozu-media-loading]")).toBeTruthy()
        expect(first.querySelector("img")).toBeNull()
        viewer.setItems([img("a", "later-a.jpg"), img("b", "later-b.jpg")])
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="0"]')).toBe(first)
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="1"]')).toBe(second)
        expect(first.querySelector("[data-yorozu-media-loading]")).toBeNull()
        expect(first.querySelector("img")?.getAttribute("src")).toBe("later-a.jpg")
        expect(second.querySelector("img")?.getAttribute("src")).toBe("later-b.jpg")
    })

    it("reusing an existing thumb img sets draggable false on same-id setItems", () => {
        viewer.open({ items: [img("a", "a.jpg"), img("b", "b.jpg")] })
        let thumbImg = root.querySelector('[data-yorozu-media-thumb][data-index="0"] img') as HTMLImageElement
        expect(thumbImg).toBeTruthy()
        thumbImg.draggable = true
        viewer.setItems([img("a", "a2.jpg"), img("b", "b2.jpg")])
        expect(root.querySelector('[data-yorozu-media-thumb][data-index="0"] img')).toBe(thumbImg)
        expect(thumbImg.getAttribute("src")).toBe("a2.jpg")
        expect(thumbImg.draggable).toBe(false)
    })

    it("centers the current thumb with scrollTo on open, goTo, and prev/next", () => {
        let scrollReceivers: HTMLElement[] = []
        let scrollArgs: ScrollToOptions[] = []
        let scrollTo = function (this: HTMLElement, options?: ScrollToOptions | number): void {
            scrollReceivers.push(this)
            if (typeof options === "object" && options != null) scrollArgs.push(options)
        }
        HTMLElement.prototype.scrollTo = scrollTo
        let layoutBox = {
            left: 0,
            width: 100,
            top: 0,
            height: 40,
            right: 100,
            bottom: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }
        let rect = (): DOMRect => layoutBox as DOMRect
        HTMLElement.prototype.getBoundingClientRect = rect
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 2 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        expect(nav.querySelector("[data-current]")?.getAttribute("data-index")).toBe("2")
        expect(scrollReceivers.length).toBeGreaterThan(0)
        expect(scrollReceivers.some((el) => el.matches("[data-yorozu-media-filmstrip]"))).toBe(true)
        let openArg = scrollArgs[0]!
        expect(openArg).toEqual(expect.objectContaining({ behavior: "instant", left: expect.any(Number) }))
        scrollReceivers.length = 0
        scrollArgs.length = 0
        viewer.goTo(0)
        expect(scrollArgs.at(-1)).toEqual(expect.objectContaining({ behavior: "smooth", left: expect.any(Number) }))
        viewer.next()
        expect(scrollArgs.at(-1)!.behavior).toBe("smooth")
        viewer.prev("swipe")
        expect(scrollArgs.at(-1)!.behavior).toBe("smooth")
    })

    it("centers with instant behavior when reduced motion is on", () => {
        stop?.()
        stop = attachMediaViewer(viewer, root, { prefersReducedMotion: () => true })
        let scrollTo = vi.fn()
        HTMLElement.prototype.scrollTo = scrollTo
        let layoutBox = {
            left: 0,
            width: 100,
            top: 0,
            height: 40,
            right: 100,
            bottom: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }
        HTMLElement.prototype.getBoundingClientRect = () => layoutBox as DOMRect
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        expect(scrollTo).toHaveBeenCalledWith(
            expect.objectContaining({ behavior: "instant", left: expect.any(Number) }),
        )
    })

    it("centers current thumb from strip scrollLeft plus layout rect mid delta", () => {
        let scrollTo = vi.fn()
        HTMLElement.prototype.scrollTo = scrollTo
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 80, configurable: true })
        viewer.setItems([img("a"), img("b"), img("c")], 0)
        scrollTo.mockClear()
        viewer.goTo(2)
        let neighborWidth = 44
        let currentWidth = 44
        let restIndex = 2
        let restWidths = [neighborWidth, neighborWidth, currentWidth]
        let restTotal = 0
        let restCenter = 0
        for (let i = 0; i < restWidths.length; i++) {
            let width = restWidths[i]!
            let pitch = filmstripThumbPitchPx(width, filmstripGapAfter(i, restIndex, 2, 8))
            if (i < restIndex) restCenter += pitch
            restTotal += pitch
        }
        restCenter += currentWidth / 2
        let startPad = filmstripEndInsetPx(restWidths[0]!, 80)
        let endPad = filmstripEndInsetPx(restWidths[restWidths.length - 1]!, 80)
        restCenter += startPad
        let lastPitch = filmstripThumbPitchPx(currentWidth, filmstripGapAfter(restIndex, restIndex, 2, 8))
        let expectedLeft = filmstripCentersScrollLeft({
            fromCenter: restCenter,
            toCenter: restCenter,
            progress: 1,
            viewportWidth: 80,
            totalSize: restTotal - Math.max(0, lastPitch - currentWidth),
            startPad,
            endPad,
        })
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: expectedLeft, behavior: "smooth" }))
    })

    it("virtualized filmstrip mounts a window of thumbs with absolute left, not N nodes", () => {
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 20,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        expect(nav.getAttribute("data-virtualized")).toBe("")
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        viewer.setItems(items, 20)
        let thumbs = [...nav.querySelectorAll("[data-yorozu-media-thumb]")]
        expect(thumbs.length).toBeGreaterThan(0)
        expect(thumbs.length).toBeLessThan(40)
        for (let el of thumbs) {
            expect((el as HTMLElement).style.position).toBe("absolute")
            expect((el as HTMLElement).style.left).toMatch(/px$/)
        }
        let current = nav.querySelector("[data-current]") as HTMLElement
        expect(current.getAttribute("data-index")).toBe("20")
    })

    it("virtualized filmstrip track is a non-shrinking sizer of n * itemSizePx", () => {
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 20,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        let track = root.querySelector("[data-yorozu-media-filmstrip] [role='list']") as HTMLElement
        expect(track.style.width).toBe(`${40 * 40}px`)
        expect(track.style.flexShrink).toBe("0")
    })

    it("virtualized centerCurrentThumb scrolls by index geometry, not getBoundingClientRect", () => {
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 0,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        let scrollTo = vi.fn()
        nav.scrollTo = scrollTo as unknown as typeof nav.scrollTo
        viewer.goTo(20)
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 80 + 20 * 40 + 20 - 100 }))
        expect(nav.querySelector("[data-current]")?.getAttribute("data-index")).toBe("20")
    })

    it("virtualized mixed-pitch centerCurrentThumb uses rowTop and current pitch", () => {
        let items = Array.from({ length: 40 }, (_, i) => imgAspect(`id-${i}`, 16, 9))
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        let scrollTo = vi.fn()
        nav.scrollTo = scrollTo as unknown as typeof nav.scrollTo
        viewer.goTo(20)
        let w = filmstripCurrentWidthPx({
            neighborWidth: 44,
            height: 64,
            cap: 160,
            naturalWidth: 16,
            naturalHeight: 9,
        })
        let rowTop = 0
        for (let i = 0; i < 20; i++) {
            rowTop += filmstripThumbPitchPx(44, filmstripGapAfter(i, 20, 2, 8))
        }
        let startPad = filmstripEndInsetPx(44, 200)
        let endPad = filmstripEndInsetPx(44, 200)
        let fromCenter = startPad + rowTop + w / 2
        let totalSize = rowTop
        for (let i = 20; i < 40; i++) {
            let width = i === 20 ? w : 44
            totalSize += filmstripThumbPitchPx(width, filmstripGapAfter(i, 20, 2, 8))
        }
        let left = filmstripCentersScrollLeft({
            fromCenter,
            toCenter: fromCenter,
            progress: 1,
            viewportWidth: 200,
            totalSize,
            startPad,
            endPad,
        })
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left }))
        expect(nav.querySelector("[data-current]")?.getAttribute("data-index")).toBe("20")
    })

    it("virtualized centerCurrentThumb clamps left at the last index", () => {
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 0,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        let scrollTo = vi.fn()
        nav.scrollTo = scrollTo as unknown as typeof nav.scrollTo
        viewer.goTo(39)
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 1560 }))
    })

    it("virtualized filmstrip does not recenter when neighbors change", () => {
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 20,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        Object.defineProperty(nav, "scrollLeft", { value: 400, configurable: true, writable: true })
        let scrollTo = vi.fn()
        nav.scrollTo = scrollTo as unknown as typeof nav.scrollTo
        viewer.setNeighbors({
            older: { id: "id-19", kind: "image", src: "id-19.jpg" },
            newer: { id: "id-21", kind: "image", src: "id-21.jpg" },
        })
        expect(scrollTo).not.toHaveBeenCalled()
        expect(nav.scrollLeft).toBe(400)
        viewer.setCanNav({ older: true, newer: true })
        viewer.setFilmstripMaxWidth("100%")
        expect(scrollTo).not.toHaveBeenCalled()
        expect(nav.scrollLeft).toBe(400)
        expect(nav.querySelector("[data-current]")?.getAttribute("data-index")).toBe("20")
    })

    it("virtualized filmstrip reuses buttons by data-id when they stay in the window", () => {
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({
            items,
            index: 20,
            filmstrip: { virtualize: true, itemSizePx: 40, overscan: 2 },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let kept = nav.querySelector('[data-id="id-20"]') as HTMLButtonElement
        expect(kept).toBeTruthy()
        viewer.goTo(21)
        expect(nav.querySelector('[data-id="id-20"]')).toBe(kept)
        expect(nav.querySelector("[data-current]")?.getAttribute("data-index")).toBe("21")
    })

    it("virtualized filmstrip uses filmstripThumbSrc for thumb images", () => {
        viewer.open({
            items: [img("a"), img("b"), img("c")],
            filmstrip: { virtualize: true },
            filmstripThumbSrc: (item) => `thumb:${item.id}`,
        })
        let thumbImg = root.querySelector("[data-yorozu-media-thumb] img")
        expect(thumbImg?.getAttribute("src")).toBe("thumb:a")
    })

    it("virtualize default mixed pitches: current cell is wider than neighbors", () => {
        let items = Array.from({ length: 10 }, (_, i) => imgAspect(`id-${i}`, 16, 9))
        viewer.open({ items, index: 2, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 400, configurable: true })
        viewer.setItems(items, 2)
        let w = filmstripCurrentWidthPx({
            neighborWidth: 44,
            height: 64,
            cap: 160,
            naturalWidth: 16,
            naturalHeight: 9,
        })
        let current = nav.querySelector("[data-current]") as HTMLElement
        let currentLeft =
            filmstripThumbPitchPx(44, filmstripGapAfter(0, 2, 2, 8)) +
            filmstripThumbPitchPx(44, filmstripGapAfter(1, 2, 2, 8))
        expect(current.style.left).toBe(`${currentLeft}px`)
        expect(current.style.width).toBe(`${w}px`)
        let neighbor = [...nav.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "3",
        ) as HTMLElement
        expect(neighbor.style.width).toBe("44px")
        expect(Number.parseFloat(neighbor.style.left)).toBe(currentLeft + w + 8)
        expect(Number.parseFloat(current.style.left) + Number.parseFloat(current.style.width) + 8).toBe(
            Number.parseFloat(neighbor.style.left),
        )
        let before = [...nav.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "1",
        ) as HTMLElement
        expect(before.style.width).toBe("44px")
        expect(Number.parseFloat(before.style.left) + Number.parseFloat(before.style.width) + 8).toBe(
            Number.parseFloat(current.style.left),
        )
        let track = nav.querySelector('[role="list"]') as HTMLElement
        let total = 0
        for (let i = 0; i < 10; i++) {
            let width = i === 2 ? w : 44
            total += filmstripThumbPitchPx(width, filmstripGapAfter(i, 2, 2, 8))
        }
        expect(track.style.width).toBe(`${total}px`)
    })

    it("compat img.src thumb onerror clears the thumb", () => {
        viewer.open({ items: [img("a"), img("b")], filmstrip: true })
        let btn = root.querySelector("[data-yorozu-media-thumb]") as HTMLElement
        let image = btn.querySelector("img") as HTMLImageElement
        expect(image).toBeTruthy()
        image.dispatchEvent(new Event("error"))
        expect(btn.querySelector("img")).toBeNull()
        expect(btn.querySelector("[data-yorozu-media-loading]")).toBeNull()
    })

    it("applies compact filmstrip max-width by default and full width when set", () => {
        viewer.open({ items: [img("a"), img("b")] })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(overlay.style.getPropertyValue("--yorozu-media-filmstrip-max-width")).toBe("36%")
        viewer.setFilmstripMaxWidth("100%")
        expect(overlay.style.getPropertyValue("--yorozu-media-filmstrip-max-width")).toBe("100%")
        viewer.open({ items: [img("a"), img("b")], filmstripMaxWidth: "24rem" })
        overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(overlay.style.getPropertyValue("--yorozu-media-filmstrip-max-width")).toBe("24rem")
    })

    it("horizontal filmstrip wheel pans; vertical strip wheel is locked off the page", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a"), img("b")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let leaked = 0
        let onLeak = (): void => {
            leaked += 1
        }
        document.body.addEventListener("wheel", onLeak)

        let horizontal = new WheelEvent("wheel", { deltaX: 40, deltaY: 0, bubbles: true, cancelable: true })
        let stopHorizontal = vi.spyOn(horizontal, "stopPropagation")
        nav.dispatchEvent(horizontal)
        expect(horizontal.defaultPrevented).toBe(false)
        expect(stopHorizontal).toHaveBeenCalled()
        expect(leaked).toBe(0)

        let vertical = new WheelEvent("wheel", { deltaX: 0, deltaY: 40, bubbles: true, cancelable: true })
        let stopVertical = vi.spyOn(vertical, "stopPropagation")
        nav.dispatchEvent(vertical)
        expect(vertical.defaultPrevented).toBe(true)
        expect(stopVertical).toHaveBeenCalled()
        expect(leaked).toBe(0)

        document.body.removeEventListener("wheel", onLeak)

        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        let stageWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        viewport.dispatchEvent(stageWheel)
        expect(stageWheel.defaultPrevented).toBe(true)

        api!.forceClose()
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()

        let bodyWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        document.body.dispatchEvent(bodyWheel)
        expect(bodyWheel.defaultPrevented).toBe(false)

        let scroller = document.createElement("div")
        document.body.append(scroller)
        let leftoverWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(leftoverWheel)
        expect(leftoverWheel.defaultPrevented).toBe(false)
        scroller.remove()
    })

    it("non-virtual current width follows aspect and clears when leaving current", () => {
        viewer.open({
            items: [imgAspect("a", 16, 9), imgAspect("b", 9, 16), img("c")],
            index: 0,
        })
        let current = root.querySelector("[data-current]") as HTMLElement
        expect(current.style.width).toBe(
            `${filmstripCurrentWidthPx({
                neighborWidth: 44,
                height: 64,
                cap: 160,
                naturalWidth: 16,
                naturalHeight: 9,
            })}px`,
        )
        viewer.next()
        let a = [...root.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "0",
        ) as HTMLElement
        expect(a.hasAttribute("data-current")).toBe(false)
        expect(a.style.width).toBe("")
        let b = root.querySelector("[data-current]") as HTMLElement
        expect(b.style.width).toBe("44px")
    })

    it("in-flow current thumb has aspect width before first append", () => {
        let expected = `${filmstripCurrentWidthPx({
            neighborWidth: 44,
            height: 64,
            cap: 160,
            naturalWidth: 16,
            naturalHeight: 9,
        })}px`
        let widthsAtAppend: string[] = []
        let origAppend = HTMLElement.prototype.append
        let spy = vi.spyOn(HTMLElement.prototype, "append").mockImplementation(function (
            this: HTMLElement,
            ...nodes: (Node | string)[]
        ) {
            for (let node of nodes) {
                if (
                    node instanceof HTMLElement &&
                    node.hasAttribute("data-yorozu-media-thumb") &&
                    node.hasAttribute("data-current")
                ) {
                    widthsAtAppend.push(node.style.width)
                }
            }
            origAppend.apply(this, nodes)
        })
        try {
            viewer.open({
                items: [imgAspect("a", 16, 9), imgAspect("b", 9, 16)],
                index: 0,
            })
        } finally {
            spy.mockRestore()
        }
        expect(widthsAtAppend[0]).toBe(expected)
    })

    it("decode apply restamps current width from adopted img naturals", async () => {
        let decoded = document.createElement("img")
        decoded.src = "blob:decoded-thumb"
        Object.defineProperty(decoded, "naturalWidth", { value: 16, configurable: true })
        Object.defineProperty(decoded, "naturalHeight", { value: 9, configurable: true })
        let decode = vi.fn<DecodeFn>(async (req) => {
            if (req.role === "thumb" && req.id === "a") return decoded
            let other = document.createElement("img")
            other.src = `blob:${req.role}:${req.id}`
            return other
        })
        viewer.destroy()
        viewer = createMediaViewer({ decode, onIndexChange })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [img("a"), img("b")], index: 0 })
        await vi.waitFor(() => {
            let current = root.querySelector("[data-yorozu-media-thumb][data-current]") as HTMLElement
            expect(current.querySelector("img")).toBe(decoded)
            expect(current.style.width).toBe(
                `${filmstripCurrentWidthPx({
                    neighborWidth: 44,
                    height: 64,
                    cap: 160,
                    naturalWidth: 16,
                    naturalHeight: 9,
                })}px`,
            )
        })
    })

    it("compat img load restamps current width when item naturals are missing", () => {
        viewer.open({ items: [img("a"), img("b")], index: 0 })
        let current = root.querySelector("[data-yorozu-media-thumb][data-current]") as HTMLElement
        expect(current.style.width).toBe("44px")
        let thumbImg = current.querySelector("img") as HTMLImageElement
        expect(thumbImg).toBeTruthy()
        Object.defineProperty(thumbImg, "naturalWidth", { value: 16, configurable: true })
        Object.defineProperty(thumbImg, "naturalHeight", { value: 9, configurable: true })
        thumbImg.dispatchEvent(new Event("load"))
        expect(current.style.width).toBe(
            `${filmstripCurrentWidthPx({
                neighborWidth: 44,
                height: 64,
                cap: 160,
                naturalWidth: 16,
                naturalHeight: 9,
            })}px`,
        )
    })

    it("virtual filmstrip does not pin CSS item-size to the current pitch", () => {
        let items = Array.from({ length: 8 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        expect(nav.style.getPropertyValue("--yorozu-media-filmstrip-item-size")).toBe("")
    })

    it("virtual load restamp snapshots overlay metrics once", () => {
        let items = Array.from({ length: 12 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let current = root.querySelector("[data-yorozu-media-thumb][data-current]") as HTMLElement
        let thumbImg = current.querySelector("img") as HTMLImageElement
        expect(thumbImg).toBeTruthy()
        Object.defineProperty(thumbImg, "naturalWidth", { value: 16, configurable: true })
        Object.defineProperty(thumbImg, "naturalHeight", { value: 9, configurable: true })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let reads = 0
        let orig = window.getComputedStyle.bind(window)
        window.getComputedStyle = ((elt: Element, pseudo?: string | null) => {
            if (elt === overlay) reads += 1
            return orig(elt, pseudo)
        }) as typeof getComputedStyle
        try {
            thumbImg.dispatchEvent(new Event("load"))
        } finally {
            window.getComputedStyle = orig
        }
        expect(reads).toBe(1)
    })

    it("filmstrip-motion is nav on next and tap on goTo", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        expect(nav.getAttribute("data-filmstrip-motion")).toBe("nav")
        viewer.next()
        expect(nav.getAttribute("data-filmstrip-motion")).toBe("nav")
        viewer.goTo(0)
        expect(nav.getAttribute("data-filmstrip-motion")).toBe("tap")
    })

    it("short strip stamps overflow false and edge attrs; long strip clears edges", () => {
        viewer.open({ items: [img("a"), img("b")], index: 0 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let clip = root.querySelector("[data-yorozu-media-filmstrip-clip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 800, configurable: true })
        Object.defineProperty(nav, "scrollWidth", { value: 200, configurable: true })
        viewer.setItems([img("a"), img("b")], 0)
        expect(nav.getAttribute("data-overflow")).toBe("false")
        expect(clip.getAttribute("data-overflow")).toBe("false")
        let thumbs = [...nav.querySelectorAll("[data-yorozu-media-thumb]")]
        expect(thumbs[0]?.getAttribute("data-edge")).toBe("start")
        expect(thumbs[1]?.getAttribute("data-edge")).toBe("end")
        let many = Array.from({ length: 20 }, (_, i) => img(`id-${i}`))
        Object.defineProperty(nav, "scrollWidth", { value: 2000, configurable: true })
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        viewer.setItems(many, 0)
        nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        clip = root.querySelector("[data-yorozu-media-filmstrip-clip]") as HTMLElement
        expect(nav.getAttribute("data-overflow")).toBe("true")
        expect(clip.getAttribute("data-overflow")).toBe("true")
        expect(nav.querySelector("[data-edge]")).toBeNull()
    })

    it("overflowing strip insets the list and centers first at scrollLeft 0", () => {
        let items = Array.from({ length: 20 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 0 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        viewer.setItems(items, 0)
        let track = nav.querySelector('[role="list"]') as HTMLElement
        let startPad = Number.parseFloat(track.style.marginInlineStart)
        expect(startPad).toBeGreaterThan(0)
        expect(Number.parseFloat(track.style.marginInlineEnd)).toBeGreaterThan(0)
        expect(nav.scrollLeft).toBe(0)
        let clip = root.querySelector("[data-yorozu-media-filmstrip-clip]") as HTMLElement
        expect(clip.getAttribute("data-overflow")).toBe("true")
        expect(clip.getAttribute("data-fade-start")).toBe("false")
        expect(clip.getAttribute("data-fade-end")).toBe("true")
    })

    it("overflowing last index turns end fade off", () => {
        let items = Array.from({ length: 20 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 0 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        viewer.setItems(items, 0)
        viewer.goTo(19)
        let clip = root.querySelector("[data-yorozu-media-filmstrip-clip]") as HTMLElement
        expect(clip.getAttribute("data-fade-start")).toBe("true")
        expect(clip.getAttribute("data-fade-end")).toBe("false")
    })

    it("fitting strip keeps edge thumbs and no list end insets", () => {
        viewer.open({ items: [img("a"), img("b")], index: 0 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 800, configurable: true })
        viewer.setItems([img("a"), img("b")], 0)
        let track = nav.querySelector('[role="list"]') as HTMLElement
        expect(track.style.marginInlineStart).toBe("")
        expect(track.style.marginInlineEnd).toBe("")
        expect(nav.getAttribute("data-overflow")).toBe("false")
        let thumbs = [...nav.querySelectorAll("[data-yorozu-media-thumb]")]
        expect(thumbs[0]?.getAttribute("data-edge")).toBe("start")
        expect(thumbs[1]?.getAttribute("data-edge")).toBe("end")
        let clip = root.querySelector("[data-yorozu-media-filmstrip-clip]") as HTMLElement
        expect(clip.getAttribute("data-fade-start")).toBe("false")
        expect(clip.getAttribute("data-fade-end")).toBe("false")
    })

    it("virtual default paints content width and current-gap gutter", () => {
        let items = [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 9, 16)]
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 800, configurable: true })
        viewer.setItems(items, 0)
        let current = nav.querySelector("[data-current]") as HTMLElement
        let w = filmstripCurrentWidthPx({
            neighborWidth: 44,
            height: 64,
            cap: 160,
            naturalWidth: 16,
            naturalHeight: 9,
        })
        expect(current.style.width).toBe(`${w}px`)
        let neighbor = [...nav.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "1",
        ) as HTMLElement
        expect(neighbor.style.width).toBe("44px")
        expect(Number.parseFloat(neighbor.style.left)).toBe(w + 8)
    })

    it("virtual explicit itemSizePx still paints pitch as width", () => {
        viewer.open({
            items: [img("a"), img("b"), img("c")],
            index: 1,
            filmstrip: { virtualize: true, itemSizePx: { neighbor: 20, current: 30 } },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let current = nav.querySelector("[data-current]") as HTMLElement
        expect(current.style.width).toBe("30px")
        expect(current.style.left).toBe("20px")
    })

    it("virtual explicit itemSizePx morph does not jump pitch or left at small live t", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let neighbor = 20
        let current = 30
        let items = [img("a"), img("b"), img("c")]
        viewer.open({
            items,
            index: 1,
            filmstrip: { virtualize: true, itemSizePx: { neighbor, current } },
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 800, configurable: true })
        viewer.setItems(items, 1)
        let thumbAt = (index: number): HTMLElement =>
            [...nav.querySelectorAll("[data-yorozu-media-thumb]")].find(
                (el) => el.getAttribute("data-index") === String(index),
            ) as HTMLElement
        let restLefts = [0, 1, 2].map((i) => Number.parseFloat(thumbAt(i).style.left))
        expect(restLefts).toEqual([0, neighbor, neighbor + current])
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 380, clientY: 200 }))
        flushLiveRaf()
        expect(viewer.snapshot().index).toBe(1)
        expect(thumbAt(1).hasAttribute("data-current")).toBe(true)
        let liveLefts = [0, 1, 2].map((i) => Number.parseFloat(thumbAt(i).style.left))
        let liveWidths = [0, 1, 2].map((i) => Number.parseFloat(thumbAt(i).style.width))
        let expectedLeft = 0
        for (let i = 0; i < liveLefts.length; i++) {
            expect(liveLefts[i]).toBeCloseTo(expectedLeft)
            expectedLeft += liveWidths[i]!
        }
        expect(liveLefts[1]).toBe(restLefts[1])
        expect(liveLefts[2]).toBeLessThan(restLefts[2]!)
        expect(restLefts[2]! - liveLefts[2]!).toBeLessThan(2)
        expect(liveWidths[0]).toBe(neighbor)
        expect(liveWidths[1]!).toBeLessThan(current)
        expect(liveWidths[1]!).toBeGreaterThan(neighbor)
        expect(liveWidths[2]!).toBeGreaterThan(neighbor)
        expect(liveWidths[2]!).toBeLessThan(current)
    })

    it("virtual default centerCurrentThumb uses content width not pitch", () => {
        let items = Array.from({ length: 10 }, (_, i) => imgAspect(`id-${i}`, 16, 9))
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        let scrollTo = vi.fn()
        nav.scrollTo = scrollTo as unknown as typeof nav.scrollTo
        viewer.goTo(4)
        let w = filmstripCurrentWidthPx({
            neighborWidth: 44,
            height: 64,
            cap: 160,
            naturalWidth: 16,
            naturalHeight: 9,
        })
        let rowTop = 0
        for (let i = 0; i < 4; i++) {
            rowTop += filmstripThumbPitchPx(44, filmstripGapAfter(i, 4, 2, 8))
        }
        let startPad = filmstripEndInsetPx(44, 200)
        let endPad = filmstripEndInsetPx(44, 200)
        let fromCenter = startPad + rowTop + w / 2
        let totalSize = rowTop
        for (let i = 4; i < 10; i++) {
            let width = i === 4 ? w : 44
            totalSize += filmstripThumbPitchPx(width, filmstripGapAfter(i, 4, 2, 8))
        }
        let left = filmstripCentersScrollLeft({
            fromCenter,
            toCenter: fromCenter,
            progress: 1,
            viewportWidth: 200,
            totalSize,
            startPad,
            endPad,
        })
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left }))
    })

    it("virtual default short strip mounts every thumb and stamps edges", () => {
        let items = Array.from({ length: 8 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let clip = root.querySelector("[data-yorozu-media-filmstrip-clip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 400, configurable: true })
        viewer.setItems(items, 0)
        let thumbs = [...nav.querySelectorAll("[data-yorozu-media-thumb]")]
        expect(thumbs).toHaveLength(items.length)
        expect(nav.getAttribute("data-overflow")).toBe("false")
        expect(clip.getAttribute("data-overflow")).toBe("false")
        expect(thumbs[0]?.getAttribute("data-edge")).toBe("start")
        expect(thumbs[thumbs.length - 1]?.getAttribute("data-edge")).toBe("end")
    })

    it("virtual index change keeps thumbs connected without replaceChildren", () => {
        let items = Array.from({ length: 8 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 400, configurable: true })
        viewer.setItems(items, 0)
        let track = nav.querySelector('[role="list"]') as HTMLElement
        let kept = nav.querySelector('[data-id="id-0"]') as HTMLButtonElement
        expect(kept).toBeTruthy()
        let replaceChildren = vi.spyOn(track, "replaceChildren")
        viewer.goTo(1)
        expect(replaceChildren).not.toHaveBeenCalled()
        expect(kept.isConnected).toBe(true)
        expect(nav.querySelector('[data-id="id-0"]')).toBe(kept)
        expect(nav.querySelector("[data-current]")?.getAttribute("data-index")).toBe("1")
    })

    it("virtual default setItems from short to long windows the overflowing album", () => {
        let short = Array.from({ length: 8 }, (_, i) => img(`id-${i}`))
        viewer.open({ items: short, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let clip = root.querySelector("[data-yorozu-media-filmstrip-clip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 400, configurable: true })
        viewer.setItems(short, 0)
        expect(nav.querySelectorAll("[data-yorozu-media-thumb]")).toHaveLength(8)
        expect(nav.getAttribute("data-overflow")).toBe("false")
        expect(clip.getAttribute("data-overflow")).toBe("false")
        let many = Array.from({ length: 20 }, (_, i) => img(`id-${i}`))
        viewer.setItems(many, 0)
        let thumbs = [...nav.querySelectorAll("[data-yorozu-media-thumb]")]
        expect(nav.getAttribute("data-overflow")).toBe("true")
        expect(clip.getAttribute("data-overflow")).toBe("true")
        expect(thumbs.length).toBeGreaterThan(0)
        expect(thumbs.length).toBeLessThan(many.length)
        expect(nav.querySelector("[data-edge]")).toBeNull()
    })

    it("horizontal swipe morphs current and incoming widths before index changes", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({
            items: [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)],
            index: 1,
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        let current = root.querySelector("[data-current]") as HTMLElement
        let restCurrent = current.style.width
        let incoming = [...root.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "2",
        ) as HTMLElement
        expect(incoming.style.width).toBe("")
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        expect(viewer.snapshot().index).toBe(1)
        expect(root.querySelectorAll("[data-current]")).toHaveLength(1)
        expect(current.hasAttribute("data-current")).toBe(true)
        expect(current.style.width).not.toBe(restCurrent)
        expect(Number.parseFloat(current.style.width)).toBeLessThan(Number.parseFloat(restCurrent))
        expect(Number.parseFloat(incoming.style.width)).toBeGreaterThan(44)
        expect(
            (root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement).getAttribute("data-filmstrip-motion"),
        ).toBe("swipe")
    })

    it("under-threshold bounce restores rest widths", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({
            items: [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)],
            index: 1,
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        let current = root.querySelector("[data-current]") as HTMLElement
        let restCurrent = current.style.width
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 380, clientY: 200 }))
        flushLiveRaf()
        expect(Number.parseFloat(current.style.width)).toBeLessThan(Number.parseFloat(restCurrent))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 380, clientY: 200 }))
        vi.advanceTimersByTime(400)
        flushLiveRaf()
        expect(viewer.snapshot().index).toBe(1)
        expect(current.style.width).toBe(restCurrent)
        let incoming = [...root.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "2",
        ) as HTMLElement
        expect(incoming.style.width).toBe("")
    })

    it("vertical dismiss does not morph filmstrip widths", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({
            items: [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)],
            index: 1,
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        let current = root.querySelector("[data-current]") as HTMLElement
        let restCurrent = current.style.width
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 200, clientY: 280 }))
        flushLiveRaf()
        expect(current.style.width).toBe(restCurrent)
        let incoming = [...root.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "2",
        ) as HTMLElement
        expect(incoming.style.width).toBe("")
    })

    it("commit paint keeps interpolating leftover offset instead of snapping to rest", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        stop?.()
        stop = attachMediaViewer(viewer, root, { prefersReducedMotion: () => false })
        viewer.open({
            items: [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)],
            index: 1,
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        expect(viewer.snapshot().index).toBe(2)
        let current = root.querySelector("[data-current]") as HTMLElement
        let rest = filmstripCurrentWidthPx({
            neighborWidth: 44,
            height: 64,
            cap: 160,
            naturalWidth: 16,
            naturalHeight: 9,
        })
        expect(current.getAttribute("data-index")).toBe("2")
        expect(current.style.width).not.toBe(`${rest}px`)
    })

    it("live swipe stamp snapshots overlay metrics once", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({
            items: [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)],
            index: 1,
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let reads = 0
        let orig = window.getComputedStyle.bind(window)
        window.getComputedStyle = ((elt: Element, pseudo?: string | null) => {
            if (elt === overlay) reads += 1
            return orig(elt, pseudo)
        }) as typeof getComputedStyle
        try {
            viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
            viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
            flushLiveRaf()
        } finally {
            window.getComputedStyle = orig
        }
        expect(reads).toBe(1)
    })

    it("virtual horizontal swipe morphs incoming content width without replaceChildren", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let items = [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)]
        viewer.open({ items, index: 1, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 800, configurable: true })
        viewer.setItems(items, 1)
        let track = nav.querySelector('[role="list"]') as HTMLElement
        let replaceChildren = vi.spyOn(track, "replaceChildren")
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        let incoming = [...nav.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "2",
        ) as HTMLElement
        expect(incoming).toBeTruthy()
        let restIncoming = incoming.style.width
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        expect(replaceChildren).not.toHaveBeenCalled()
        expect(viewer.snapshot().index).toBe(1)
        expect(Number.parseFloat(incoming.style.width)).toBeGreaterThan(Number.parseFloat(restIncoming || "44"))
    })

    it("reduced-motion commit lands rest scrollLeft not leftover pair-center", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        stop?.()
        stop = attachMediaViewer(viewer, root, { prefersReducedMotion: () => true })
        viewer.open({
            items: [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)],
            index: 1,
        })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let stripViewport = 80
        let storedLeft = 0
        Object.defineProperty(nav, "clientWidth", { value: stripViewport, configurable: true })
        Object.defineProperty(nav, "scrollLeft", {
            configurable: true,
            get: () => storedLeft,
            set: (value: number) => {
                storedLeft = Number(value)
            },
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 200 }))
        let leftoverLeft = nav.scrollLeft
        let restIndex = 2
        let neighborWidth = 44
        let currentWidth = filmstripCurrentWidthPx({
            neighborWidth,
            height: 64,
            cap: 160,
            naturalWidth: 16,
            naturalHeight: 9,
        })
        let restWidths = [neighborWidth, neighborWidth, currentWidth]
        let restTotal = 0
        let restCenter = 0
        for (let i = 0; i < restWidths.length; i++) {
            let width = restWidths[i]!
            let pitch = filmstripThumbPitchPx(width, filmstripGapAfter(i, restIndex, 2, 8))
            if (i < restIndex) restCenter += pitch
            restTotal += pitch
        }
        restCenter += currentWidth / 2
        let startPad = filmstripEndInsetPx(restWidths[0]!, stripViewport)
        let endPad = filmstripEndInsetPx(restWidths[restWidths.length - 1]!, stripViewport)
        restCenter += startPad
        let restLeft = filmstripCentersScrollLeft({
            fromCenter: restCenter,
            toCenter: restCenter,
            progress: 0,
            viewportWidth: stripViewport,
            totalSize: restTotal,
            startPad,
            endPad,
        })
        expect(leftoverLeft).not.toBe(restLeft)
        flushLiveRaf()
        flushLiveRaf()
        expect(viewer.snapshot().index).toBe(2)
        expect(nav.scrollLeft).toBe(restLeft)
    })

    it("open land does not rest-center filmstrip during live swipe morph", async () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let items = [imgAspect("a", 16, 9), imgAspect("b", 1, 1), imgAspect("c", 16, 9)]
        viewer.open({ items, index: 1, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let stripViewport = 80
        let storedLeft = 0
        Object.defineProperty(nav, "clientWidth", { value: stripViewport, configurable: true })
        Object.defineProperty(nav, "scrollLeft", {
            configurable: true,
            get: () => storedLeft,
            set: (value: number) => {
                storedLeft = Number(value)
            },
        })
        nav.scrollTo = ((options?: ScrollToOptions | number) => {
            if (typeof options === "object" && options != null && options.left != null) {
                storedLeft = Number(options.left)
            }
        }) as typeof nav.scrollTo
        viewer.setItems(items, 1)
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        let liveLeft = nav.scrollLeft
        let neighborWidth = 44
        let currentWidth = filmstripCurrentWidthPx({
            neighborWidth,
            height: 64,
            cap: 160,
            naturalWidth: 1,
            naturalHeight: 1,
        })
        let restIndex = 1
        let restWidths = [neighborWidth, currentWidth, neighborWidth]
        let restTotal = 0
        let restCenter = 0
        for (let i = 0; i < restWidths.length; i++) {
            let width = restWidths[i]!
            let pitch = filmstripThumbPitchPx(width, filmstripGapAfter(i, restIndex, 2, 8))
            if (i < restIndex) restCenter += pitch
            restTotal += pitch
        }
        restCenter += currentWidth / 2
        let startPad = filmstripEndInsetPx(restWidths[0]!, stripViewport)
        let endPad = filmstripEndInsetPx(restWidths[restWidths.length - 1]!, stripViewport)
        restCenter += startPad
        let restLeft = filmstripCentersScrollLeft({
            fromCenter: restCenter,
            toCenter: restCenter,
            progress: 0,
            viewportWidth: stripViewport,
            totalSize: restTotal,
            startPad,
            endPad,
        })
        expect(liveLeft).not.toBe(restLeft)
        await Promise.resolve()
        expect(nav.scrollLeft).toBe(liveLeft)
    })

    it("live swipe stamp reads current and incoming thumbs once", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let items = Array.from({ length: 12 }, (_, i) =>
            imgAspect(`id-${i}`, i % 2 === 0 ? 16 : 1, i % 2 === 0 ? 9 : 1),
        )
        viewer.open({ items, index: 5 })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let origQuery = nav.querySelector.bind(nav)
        let indexReads = 0
        nav.querySelector = ((selectors: string) => {
            if (String(selectors).includes("data-index")) indexReads += 1
            return origQuery(selectors)
        }) as typeof nav.querySelector
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 160, 600)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        expect(indexReads).toBe(2)
    })
})
