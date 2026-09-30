// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import { MEDIA_WHEEL_ZOOM_RELEASE_MS, MEDIA_ZOOM_SETTLE_MS } from "../zoom"
import type { MediaViewerChromeApi } from "../types"
import {
    DecodeFn,
    img,
    imgAspect,
    mountAttach,
    origin,
    pointer,
    teardownAttach,
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

    it("zoom drag does not set isGesturing", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        api!.zoomIn()
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 140, clientY: 200 }))
        expect(viewer.isGesturing()).toBe(false)
        expect(api!.isGesturing()).toBe(false)
    })

    it("tap without drag does not change scale", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 200 }))
        expect(api!.scale()).toBe(1)
        api!.zoomIn()
        expect(api!.scale()).toBe(1.25)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 200 }))
        expect(api!.scale()).toBe(1.25)
    })

    it("two-pointer pinch zooms the image and legalizes on release", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 350, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerdown", { pointerId: 2, clientX: 450, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { pointerId: 2, clientX: 650, clientY: 200 }))
        expect(api!.scale()).toBeGreaterThan(1)
        viewport.dispatchEvent(pointer("pointerup", { pointerId: 2, clientX: 650, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { pointerId: 1, clientX: 350, clientY: 200 }))
        expect(api!.scale()).toBeGreaterThan(1)
        expect(api!.scale()).toBeLessThanOrEqual(20)
    })

    it("trapWheel is bound on the viewport; chrome footer wheel is not preventDefault", () => {
        viewer.open({
            items: [img("a")],
            chrome: {
                footer: (el) => {
                    let film = document.createElement("div")
                    film.setAttribute("data-filmstrip", "")
                    el.append(film)
                },
            },
        })
        let footer = root.querySelector("[data-yorozu-media-footer]") as HTMLElement
        let chromeWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        let stopChrome = vi.spyOn(chromeWheel, "stopPropagation")
        footer.dispatchEvent(chromeWheel)
        expect(chromeWheel.defaultPrevented).toBe(false)
        expect(stopChrome).toHaveBeenCalled()

        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        let stageWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        viewport.dispatchEvent(stageWheel)
        expect(stageWheel.defaultPrevented).toBe(true)

        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("b")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        let zoomWheel = new WheelEvent("wheel", { deltaY: -90, ctrlKey: true, bubbles: true, cancelable: true })
        viewport.dispatchEvent(zoomWheel)
        expect(api!.scale()).toBeGreaterThan(1)
    })

    it("ctrl/meta wheel can undershoot fit then eases back after idle release", () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "performance", "requestAnimationFrame"] })
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        for (let i = 0; i < 40; i++) {
            viewport.dispatchEvent(
                new WheelEvent("wheel", { deltaY: 900, ctrlKey: true, bubbles: true, cancelable: true }),
            )
        }
        expect(api!.scale()).toBeLessThan(1)
        expect(api!.scale()).toBeGreaterThanOrEqual(0.2)
        expect(api!.scale()).toBeLessThan(0.5)

        vi.advanceTimersByTime(MEDIA_WHEEL_ZOOM_RELEASE_MS)
        expect(api!.scale()).toBeLessThan(1)
        vi.advanceTimersByTime(MEDIA_ZOOM_SETTLE_MS + 16)
        expect(api!.scale()).toBe(1)
        vi.useRealTimers()
    })

    it("measureZoom uses untransformed client box, not transformed bounding rect", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let pane = root.querySelector('[data-side="active"]') as HTMLElement
        let zoomEl = root.querySelector("[data-yorozu-media-zoom]") as HTMLElement
        let stubClient = (el: HTMLElement, width: number, height: number): void => {
            Object.defineProperty(el, "clientWidth", { configurable: true, get: () => width })
            Object.defineProperty(el, "clientHeight", { configurable: true, get: () => height })
        }
        let stubRect = (el: HTMLElement, width: number, height: number): void => {
            el.getBoundingClientRect = (): DOMRect =>
                ({
                    x: 0,
                    y: 0,
                    top: 0,
                    left: 0,
                    right: width,
                    bottom: height,
                    width,
                    height,
                    toJSON: () => ({}),
                }) as DOMRect
        }
        stubClient(pane, 400, 300)
        stubClient(zoomEl, 400, 300)
        stubRect(zoomEl, 400, 300)
        stubRect(pane, 400, 300)
        viewer.setNeighbors({ older: null, newer: null })
        for (let i = 0; i < 20; i++) api!.zoomIn()
        expect(api!.scale()).toBe(20)
        stubRect(zoomEl, 8000, 6000)
        viewer.setNeighbors({ older: null, newer: null })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaX: 100000, deltaY: 0, bubbles: true, cancelable: true }))
        let t = zoomEl.style.transform
        let tx = Number(/translate3d\(([-\d.]+)px/.exec(t)?.[1] ?? "0")
        expect(Math.abs(tx)).toBeLessThanOrEqual(3800 + 1)
    })

    it("pinch second pointer setPointerCapture on the viewport", () => {
        viewer.open({ items: [img("a")] })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        let image = root.querySelector("[data-yorozu-media-zoom] img") as HTMLImageElement
        let capture = vi.fn()
        viewport.setPointerCapture = capture
        image.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 350, clientY: 200 }))
        image.dispatchEvent(pointer("pointerdown", { pointerId: 2, clientX: 450, clientY: 200 }))
        expect(capture).toHaveBeenCalledWith(1)
        expect(capture).toHaveBeenCalledWith(2)
    })

    it("pointerdown on video does not setPointerCapture; zoom image still does", () => {
        viewer.open({
            items: [{ id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }],
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        let capture = vi.fn()
        viewport.setPointerCapture = capture
        let video = root.querySelector("video") as HTMLVideoElement
        video.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 350, clientY: 200 }))
        expect(capture).not.toHaveBeenCalled()

        viewer.open({ items: [img("a")] })
        viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        capture = vi.fn()
        viewport.setPointerCapture = capture
        let image = root.querySelector("[data-yorozu-media-zoom] img") as HTMLImageElement
        image.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 350, clientY: 200 }))
        expect(capture).toHaveBeenCalledWith(1)
    })
})
