// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./attach"
import { MEDIA_GHOST_ANIMATING_CLASS } from "./ghost"
import { createMediaViewer, type MediaViewer } from "./session"
import type { MediaViewerChromeApi, MediaViewerItem, MediaViewerOrigin } from "./types"

function img(id: string, src: string | null = `${id}.jpg`): MediaViewerItem {
    return { id, kind: "image", src }
}

function pointer(type: string, init: Partial<PointerEventInit>): PointerEvent {
    return new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        ...init,
    })
}

let origin: MediaViewerOrigin = {
    id: "a",
    rect: { top: 10, left: 20, width: 40, height: 40 },
    imageUrl: "a.jpg",
    objectFit: "cover",
    naturalWidth: 200,
    naturalHeight: 200,
}

describe("attachMediaViewer", () => {
    let viewer: MediaViewer
    let root: HTMLElement
    let stop: (() => void) | undefined
    let animate: ReturnType<typeof vi.fn>
    let onIndexChange: ReturnType<typeof vi.fn>

    beforeEach(() => {
        animate = vi.fn(() => ({
            finished: Promise.resolve(),
            cancel: vi.fn(),
        }))
        HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })) as unknown as typeof window.matchMedia
        onIndexChange = vi.fn()
        viewer = createMediaViewer({ onIndexChange })
        root = document.createElement("div")
        document.body.append(root)
        stop = attachMediaViewer(viewer, root)
    })

    afterEach(() => {
        stop?.()
        stop = undefined
        viewer.destroy()
        root.remove()
        document.documentElement.classList.remove(MEDIA_GHOST_ANIMATING_CLASS)
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })

    it("open paints dialog + active img src", () => {
        viewer.open({ items: [img("a")] })
        expect(root.getAttribute("data-yorozu-media-root")).toBe("")
        let dialog = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(dialog).toBeTruthy()
        expect(dialog.getAttribute("role")).toBe("dialog")
        expect(dialog.getAttribute("aria-modal")).toBe("true")
        expect(dialog.getAttribute("aria-label")).toBe("Media viewer")
        expect(dialog.getAttribute("tabindex")).toBe("-1")
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage).toBeInstanceOf(HTMLImageElement)
        expect(stage.getAttribute("src")).toBe("a.jpg")
        expect(stage.hasAttribute("data-gallery-stage-media")).toBe(false)
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeTruthy()
        expect(root.querySelector("[data-yorozu-media-header]")).toBeTruthy()
        expect(root.querySelector("[data-yorozu-media-footer]")).toBeTruthy()
        expect(root.querySelector("[data-yorozu-media-chrome]")).toBeTruthy()
    })

    it("chrome header mount receives api and api.close({ ghost: false }) removes overlay", () => {
        let api: MediaViewerChromeApi | undefined
        let headerEl: HTMLElement | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (el, chromeApi) => {
                    headerEl = el
                    api = chromeApi
                },
            },
        })
        expect(headerEl?.getAttribute("data-yorozu-media-header")).toBe("")
        expect(api).toBeTruthy()
        api!.close({ ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        expect(viewer.snapshot().open).toBe(false)
    })

    it("neighbor without src still paints older/newer loading panes; pointer swipe moves index", () => {
        let a = img("a")
        let b = img("b")
        let c = img("c")
        viewer.open({ items: [a, b, c], index: 1 })
        viewer.setNeighbors({
            older: { id: "a", kind: "image", src: null },
            newer: { id: "c", kind: "image", src: null },
        })
        expect(root.querySelector('[data-side="older"] [data-yorozu-media-loading]')).toBeTruthy()
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-loading]')).toBeTruthy()
        expect(root.querySelector('[data-side="active"] [data-yorozu-media-stage]')).toBeTruthy()

        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        expect(viewport).toBeTruthy()
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 200 }))
        expect(viewer.snapshot().index).toBe(2)
        expect(onIndexChange).toHaveBeenCalledTimes(1)
        expect(onIndexChange).toHaveBeenCalledWith(2, viewer.snapshot().current)
    })

    it("keyboard ArrowRight moves index when not zoomed", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.snapshot().current?.id).toBe("b")
    })

    it("open({ ghost: false, origin }) does not add yorozu-media-ghost-animating", () => {
        viewer.open({ items: [img("a")], origin, ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeTruthy()
        expect(document.documentElement.classList.contains("yorozu-media-ghost-animating")).toBe(false)
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(false)
        expect(animate).not.toHaveBeenCalled()
    })

    it("video paints <video controls>", () => {
        viewer.open({
            items: [{ id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }],
        })
        let video = root.querySelector("video") as HTMLVideoElement
        expect(video).toBeTruthy()
        expect(video.controls).toBe(true)
        expect(video.getAttribute("data-yorozu-media-stage")).toBe("")
        expect(video.getAttribute("src")).toBe("v.mp4")
        expect(video.getAttribute("poster")).toBe("p.jpg")
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeNull()
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

    it("chrome api exposes scale and percentLabel", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        expect(api!.percentLabel()).toBe("100%")
        expect(api!.scale()).toBe(1)
        api!.zoomIn()
        expect(api!.scale()).toBe(1.25)
        expect(api!.percentLabel()).toBe("125%")
    })

    it("tap without drag toggles fit and max even when already zoomed", () => {
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
        expect(api!.scale()).toBe(20)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 205, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 205, clientY: 200 }))
        expect(api!.scale()).toBe(1)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 200 }))
        expect(api!.scale()).toBe(20)
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 240, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 240, clientY: 200 }))
        expect(api!.scale()).toBe(20)
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

    it("trapWheel is bound on the viewport so chrome can scroll", () => {
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
        footer.dispatchEvent(chromeWheel)
        expect(chromeWheel.defaultPrevented).toBe(false)

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

    it("re-open remounts chrome of the same identity and restarts open phase", () => {
        let mounts = 0
        let unmounts = 0
        let header = (): (() => void) => {
            mounts += 1
            return () => {
                unmounts += 1
            }
        }
        viewer.open({ items: [img("a")], origin, ghost: false, chrome: { header } })
        expect(mounts).toBe(1)
        expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
        viewer.open({ items: [img("b")], origin, chrome: { header } })
        expect(mounts).toBe(2)
        expect(unmounts).toBe(1)
        expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("opening")
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
        let onRequestNewer = vi.fn()
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
})
