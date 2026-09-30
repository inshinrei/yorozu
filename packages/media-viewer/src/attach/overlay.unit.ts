// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import { MEDIA_SWIPE_WHEEL_COOLDOWN_MS, MEDIA_SWIPE_WHEEL_RELEASE_MS } from "../swipe"
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
})
