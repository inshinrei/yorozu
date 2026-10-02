// @vitest-environment jsdom
import { MOTION_NAV_MS, MOTION_SETTLE_MS } from "@yorozu/animations"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import {
    MEDIA_SWIPE_WHEEL_COOLDOWN_MS,
    MEDIA_SWIPE_WHEEL_RELEASE_MS,
    mediaSwipeParallaxScale,
    mediaSwipeParallaxTransformStyle,
    mediaSwipeParallaxX,
} from "../swipe"
import type { MediaViewerChromeApi } from "../types"
import { viewportFallback } from "./css"
import {
    DecodeFn,
    flushLiveRaf,
    img,
    imgAspect,
    mockViewportBox,
    mountAttach,
    origin,
    pointer,
    teardownAttach,
    type AttachTestMount,
} from "./test-helpers"

function parseTranslateX(transform: string): number {
    let match = /translate3d\(([-\d.]+)px/.exec(transform)
    return match ? Number(match[1]) : 0
}

function stubClientBox(el: HTMLElement, width: number, height: number): void {
    Object.defineProperty(el, "clientWidth", { configurable: true, get: () => width })
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => height })
}

function stubBitmapNaturals(root: HTMLElement, width = 800, height = 600): void {
    for (let el of root.querySelectorAll("[data-yorozu-media-stage], [data-yorozu-media-peek]")) {
        if (el instanceof HTMLImageElement) {
            Object.defineProperty(el, "naturalWidth", { configurable: true, value: width })
            Object.defineProperty(el, "naturalHeight", { configurable: true, value: height })
        }
    }
}

function stubClipBoxes(root: HTMLElement, width = 200, height = 150): void {
    for (let clip of root.querySelectorAll("[data-yorozu-media-clip]")) {
        if (clip instanceof HTMLElement) stubClientBox(clip, width, height)
    }
}

function restampBitmaps(root: HTMLElement): void {
    stubBitmapNaturals(root)
    stubClipBoxes(root)
    for (let el of root.querySelectorAll("[data-yorozu-media-stage], [data-yorozu-media-peek]")) {
        el.dispatchEvent(new Event("load"))
    }
    flushLiveRaf()
}

function expectedPaneTransform(
    root: HTMLElement,
    side: "older" | "active" | "newer",
    offsetX: number,
    viewportWidth: number,
    live: boolean,
): string {
    let inner = root.querySelector(
        `[data-side=${side}] [data-yorozu-media-stage], [data-side=${side}] [data-yorozu-media-peek]`,
    ) as HTMLElement | null
    let clip = inner?.closest("[data-yorozu-media-clip]") as HTMLElement | null
    let clipW = clip?.clientWidth || 0
    let parallaxX = mediaSwipeParallaxX({
        offsetX,
        side,
        viewportWidth,
        live,
        reduced: false,
    })
    return mediaSwipeParallaxTransformStyle(parallaxX, mediaSwipeParallaxScale(parallaxX, clipW))
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

    it("no-ghost open ends data-phase open with data-scrim", () => {
        viewer.open({ items: [img("a")], origin, ghost: false })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(overlay.getAttribute("data-phase")).toBe("open")
        expect(overlay.hasAttribute("data-scrim")).toBe(true)
    })

    it("created overlay commits data-phase opening then reflows before open attrs", () => {
        let phasesAtReflow: string[] = []
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
            configurable: true,
            get() {
                if ((this as HTMLElement).hasAttribute("data-yorozu-media-viewer")) {
                    phasesAtReflow.push((this as HTMLElement).getAttribute("data-phase") ?? "")
                }
                return 800
            },
        })
        try {
            viewer.open({ items: [img("a")] })
            expect(phasesAtReflow).toContain("opening")
            let overlay = root.querySelector("[data-yorozu-media-viewer]")
            expect(overlay?.getAttribute("data-phase")).toBe("open")
            expect(overlay?.hasAttribute("data-scrim")).toBe(true)
        } finally {
            Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth")
        }
    })

    it("data-swipe-dismiss is set while dragging down and not while dragging up", async () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a")] })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 280 }))
        await vi.advanceTimersByTimeAsync(16)
        expect(overlay.hasAttribute("data-swipe-dismiss")).toBe(true)
        viewport.dispatchEvent(pointer("pointerup", { clientX: 400, clientY: 280 }))
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()

        viewer.open({ items: [img("a")] })
        overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 120 }))
        await vi.advanceTimersByTimeAsync(16)
        expect(overlay.hasAttribute("data-swipe-dismiss")).toBe(false)
        expect(overlay.getAttribute("data-phase")).toBe("open")
    })

    it("overlay locks wheel and touchmove while open; listeners die after forceClose", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(overlay).toBeTruthy()

        let overlayWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        overlay.dispatchEvent(overlayWheel)
        expect(overlayWheel.defaultPrevented).toBe(true)

        let touch = new TouchEvent("touchmove", { bubbles: true, cancelable: true })
        overlay.dispatchEvent(touch)
        expect(touch.defaultPrevented).toBe(true)

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

    it("swipe-close leftover wheel on a page scroller is prevented until linger elapses", () => {
        vi.useFakeTimers()
        expect(MEDIA_SWIPE_WHEEL_COOLDOWN_MS).toBeGreaterThan(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        viewer.open({ items: [img("a")] })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        expect(viewport).toBeTruthy()
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 280 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 400, clientY: 280 }))
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        expect(viewer.snapshot().open).toBe(false)

        let scroller = document.createElement("div")
        document.body.append(scroller)
        let leftoverWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(leftoverWheel)
        expect(leftoverWheel.defaultPrevented).toBe(true)

        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_RELEASE_MS)
        let stillLocked = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(stillLocked)
        expect(stillLocked.defaultPrevented).toBe(true)

        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_COOLDOWN_MS - MEDIA_SWIPE_WHEEL_RELEASE_MS)
        let afterLinger = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(afterLinger)
        expect(afterLinger.defaultPrevented).toBe(false)
        scroller.remove()
        vi.useRealTimers()
    })

    it("swipe-close leftover wheel does not restart the linger lock", () => {
        vi.useFakeTimers()
        viewer.open({ items: [img("a")] })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 280 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 400, clientY: 280 }))
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()

        let scroller = document.createElement("div")
        document.body.append(scroller)
        let first = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(first)
        expect(first.defaultPrevented).toBe(true)
        vi.advanceTimersByTime(50)
        let leftover = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(leftover)
        expect(leftover.defaultPrevented).toBe(true)
        vi.advanceTimersByTime(MEDIA_SWIPE_WHEEL_COOLDOWN_MS - 50)
        let after = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(after)
        expect(after.defaultPrevented).toBe(false)
        scroller.remove()
        vi.useRealTimers()
    })

    it("forceClose does not linger-lock the page scroller", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        api!.forceClose()
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()

        let scroller = document.createElement("div")
        document.body.append(scroller)
        let wheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(wheel)
        expect(wheel.defaultPrevented).toBe(false)
        scroller.remove()
    })

    it("forceClose cancels leftover rAF queued by zoom.reset", () => {
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
        expect(api!.scale()).toBeGreaterThan(1)
        let raf = vi.fn((_cb: FrameRequestCallback) => 77)
        let cancel = vi.fn()
        vi.stubGlobal("requestAnimationFrame", raf)
        vi.stubGlobal("cancelAnimationFrame", cancel)
        // Session forceClose paints once: zoom.reset can queue a frame after the first cancelRaf.
        expect(() => viewer.forceClose()).not.toThrow()
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        expect(raf).toHaveBeenCalled()
        expect(cancel).toHaveBeenCalledWith(77)
        vi.unstubAllGlobals()
    })

    it("forceClose during swipe ghost close does not linger-lock the page scroller", async () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            origin,
            ghost: true,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        await vi.waitFor(() => {
            expect(overlay?.getAttribute("data-phase")).toBe("open")
        })

        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 280 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 400, clientY: 280 }))
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeTruthy()
        expect(viewer.snapshot().open).toBe(true)

        api!.forceClose()
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        expect(viewer.snapshot().open).toBe(false)

        let scroller = document.createElement("div")
        document.body.append(scroller)
        let wheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        scroller.dispatchEvent(wheel)
        expect(wheel.defaultPrevented).toBe(false)
        scroller.remove()
    })

    it("chrome footer wheel stopPropagates without preventDefault; overlay scrim still locks", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                footer: (el, chromeApi) => {
                    api = chromeApi
                    el.textContent = "host-footer"
                },
            },
        })
        let footer = root.querySelector("[data-yorozu-media-footer]") as HTMLElement
        let footerWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        let stopFooter = vi.spyOn(footerWheel, "stopPropagation")
        footer.dispatchEvent(footerWheel)
        expect(footerWheel.defaultPrevented).toBe(false)
        expect(stopFooter).toHaveBeenCalled()

        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let scrimWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        overlay.dispatchEvent(scrimWheel)
        expect(scrimWheel.defaultPrevented).toBe(true)

        api!.forceClose()
        let bodyWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        document.body.dispatchEvent(bodyWheel)
        expect(bodyWheel.defaultPrevented).toBe(false)
    })

    it("chrome header and overlay chrome wheel stopPropagates without preventDefault", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
                overlay: (el) => {
                    el.textContent = "host-chrome"
                },
            },
        })
        let header = root.querySelector("[data-yorozu-media-header]") as HTMLElement
        let chromeEl = root.querySelector("[data-yorozu-media-chrome]") as HTMLElement
        for (let el of [header, chromeEl]) {
            let wheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
            let stop = vi.spyOn(wheel, "stopPropagation")
            el.dispatchEvent(wheel)
            expect(wheel.defaultPrevented).toBe(false)
            expect(stop).toHaveBeenCalled()
        }
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let scrimWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        overlay.dispatchEvent(scrimWheel)
        expect(scrimWheel.defaultPrevented).toBe(true)
        api!.forceClose()
        let bodyWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        document.body.dispatchEvent(bodyWheel)
        expect(bodyWheel.defaultPrevented).toBe(false)
    })

    it("filmstrip touchend clears the pan sample so the next gesture starts fresh", () => {
        viewer.open({ items: [img("a"), img("b")] })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement

        function touchMove(clientX: number, clientY: number): TouchEvent {
            let touch = {
                identifier: 0,
                target: nav,
                clientX,
                clientY,
                pageX: clientX,
                pageY: clientY,
                screenX: clientX,
                screenY: clientY,
                radiusX: 0,
                radiusY: 0,
                rotationAngle: 0,
                force: 1,
            }
            return new TouchEvent("touchmove", {
                bubbles: true,
                cancelable: true,
                touches: [touch] as unknown as Touch[],
                targetTouches: [touch] as unknown as Touch[],
                changedTouches: [touch] as unknown as Touch[],
            })
        }

        let first = touchMove(100, 100)
        nav.dispatchEvent(first)
        expect(first.defaultPrevented).toBe(true)

        let panX = touchMove(200, 110)
        nav.dispatchEvent(panX)
        expect(panX.defaultPrevented).toBe(false)

        overlay.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true }))

        let nextFirst = touchMove(250, 115)
        nav.dispatchEvent(nextFirst)
        expect(nextFirst.defaultPrevented).toBe(true)
    })

    it.each(["pointerup", "pointercancel", "touchcancel"] as const)(
        "filmstrip %s clears the pan sample so the next gesture starts fresh",
        (type) => {
            viewer.open({ items: [img("a"), img("b")] })
            let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
            let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
            function touchMove(clientX: number, clientY: number): TouchEvent {
                let touch = {
                    identifier: 0,
                    target: nav,
                    clientX,
                    clientY,
                    pageX: clientX,
                    pageY: clientY,
                    screenX: clientX,
                    screenY: clientY,
                    radiusX: 0,
                    radiusY: 0,
                    rotationAngle: 0,
                    force: 1,
                }
                return new TouchEvent("touchmove", {
                    bubbles: true,
                    cancelable: true,
                    touches: [touch] as unknown as Touch[],
                    targetTouches: [touch] as unknown as Touch[],
                    changedTouches: [touch] as unknown as Touch[],
                })
            }
            let first = touchMove(100, 100)
            nav.dispatchEvent(first)
            expect(first.defaultPrevented).toBe(true)
            let panX = touchMove(200, 110)
            nav.dispatchEvent(panX)
            expect(panX.defaultPrevented).toBe(false)
            if (type === "touchcancel") {
                overlay.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true, cancelable: true }))
            } else {
                overlay.dispatchEvent(
                    new PointerEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        pointerId: 1,
                        clientX: 200,
                        clientY: 110,
                    }),
                )
            }
            let nextFirst = touchMove(250, 115)
            nav.dispatchEvent(nextFirst)
            expect(nextFirst.defaultPrevented).toBe(true)
        },
    )

    it("rest open has no data-pager-field", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a"), img("b")] })
        restampBitmaps(root)
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        expect(viewport.hasAttribute("data-pager-field")).toBe(false)
        expect(
            (root.querySelector("[data-side=active] [data-yorozu-media-stage]") as HTMLElement).style.transform,
        ).toBe("")
    })

    it("horizontal drag stamps data-pager-field and not data-swipe-dismiss", async () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 400, 600)
        restampBitmaps(root)
        let stage = root.querySelector("[data-side=active] [data-yorozu-media-stage]") as HTMLImageElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        expect(viewport.hasAttribute("data-pager-field")).toBe(true)
        expect(overlay.hasAttribute("data-swipe-dismiss")).toBe(false)
        let strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        let zoomEl = root.querySelector("[data-yorozu-media-zoom]") as HTMLElement
        let offsetX = parseTranslateX(strip.style.transform)
        let vw = viewport.clientWidth || viewportFallback().width
        expect(stage.style.transform).toBe(expectedPaneTransform(root, "active", offsetX, vw, true))
        expect(stage.style.transform).toContain("scale(")
        expect(zoomEl.style.transform).toBe("translate3d(0px, 0px, 0) scale(1)")
    })

    it("horizontal drag pans older and newer peeks with the active bitmap", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 400, 600)
        restampBitmaps(root)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        let strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        let offsetX = parseTranslateX(strip.style.transform)
        expect(offsetX).not.toBe(0)
        let vw = viewport.clientWidth || viewportFallback().width
        for (let side of ["older", "active", "newer"] as const) {
            let inner = root.querySelector(
                `[data-side=${side}] [data-yorozu-media-stage], [data-side=${side}] [data-yorozu-media-peek]`,
            ) as HTMLElement
            expect(inner.style.transform).toBe(expectedPaneTransform(root, side, offsetX, vw, true))
            expect(inner.style.transform).toContain("translate3d(")
            expect(inner.style.transform).toContain("scale(")
            let scale = Number(/scale\(([-\d.]+)\)/.exec(inner.style.transform)?.[1] ?? "NaN")
            expect(scale).toBeGreaterThan(1)
        }
    })

    it("vertical down drag sets data-swipe-dismiss and not data-pager-field", async () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a"), img("b")] })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 400, 600)
        restampBitmaps(root)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 400, clientY: 280 }))
        flushLiveRaf()
        expect(overlay.hasAttribute("data-swipe-dismiss")).toBe(true)
        expect(viewport.hasAttribute("data-pager-field")).toBe(false)
        expect(
            (root.querySelector("[data-side=active] [data-yorozu-media-stage]") as HTMLElement).style.transform,
        ).toBe("")
    })

    it("horizontal drag under 50px clears data-pager-field after bounce settle", async () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 400, 600)
        restampBitmaps(root)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 380, clientY: 200 }))
        flushLiveRaf()
        expect(viewport.hasAttribute("data-pager-field")).toBe(true)
        viewport.dispatchEvent(pointer("pointerup", { clientX: 380, clientY: 200 }))
        await vi.advanceTimersByTimeAsync(MOTION_SETTLE_MS + 32)
        flushLiveRaf()
        expect(viewport.hasAttribute("data-pager-field")).toBe(false)
        expect(
            (root.querySelector("[data-side=active] [data-yorozu-media-stage]") as HTMLElement).style.transform,
        ).toBe("")
    })

    it("commit hop leftover offset keeps data-pager-field until offset returns to 0", async () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        mockViewportBox(viewport, 400, 600)
        restampBitmaps(root)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        viewport.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 200 }))
        flushLiveRaf()
        expect(viewport.hasAttribute("data-pager-field")).toBe(true)
        await vi.advanceTimersByTimeAsync(MOTION_NAV_MS + 32)
        restampBitmaps(root)
        expect(viewport.hasAttribute("data-pager-field")).toBe(false)
        expect(
            (root.querySelector("[data-side=active] [data-yorozu-media-stage]") as HTMLElement).style.transform,
        ).toBe("")
    })

    it("keyboard switch does not stamp data-pager-field", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        restampBitmaps(root)
        let strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        expect(strip.getAttribute("data-switch")).toBe("newer")
        expect(viewport.hasAttribute("data-pager-field")).toBe(false)
        expect(
            (root.querySelector("[data-side=active] [data-yorozu-media-stage]") as HTMLElement).style.transform,
        ).toBe("")
    })

    it("strip does not inline slide-gap", () => {
        viewer.open({ items: [img("a"), img("b")] })
        let strip = root.querySelector("[data-yorozu-media-strip]") as HTMLElement
        expect(strip.style.getPropertyValue("--yorozu-media-slide-gap")).toBe("")
    })
})
