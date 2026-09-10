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
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
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

    it("trapWheel is bound on the viewport; overlay lock still prevents footer wheel", () => {
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
        expect(chromeWheel.defaultPrevented).toBe(true)

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

    it("close ghost still plays when stage fit is null", async () => {
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
        expect(viewer.beginClose()).toBe(true)
        let before = animate.mock.calls.length
        api!.close()
        let overlay = root.querySelector("[data-yorozu-media-viewer]")
        expect(
            document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS) ||
                overlay?.getAttribute("data-phase") === "closing",
        ).toBe(true)
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve())
            })
        })
        expect(animate.mock.calls.length).toBeGreaterThan(before)
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
        expect(nav.parentElement).toBe(footer.parentElement)
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

    it("scrolls the current thumb into view after open, goTo, and prev/next", () => {
        let scrollIntoView = vi.fn()
        HTMLElement.prototype.scrollIntoView = scrollIntoView
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 2 })
        let current = root.querySelector("[data-yorozu-media-thumb][data-current]") as HTMLButtonElement
        expect(current.getAttribute("data-index")).toBe("2")
        expect(scrollIntoView).toHaveBeenCalledWith({ inline: "center", block: "nearest" })
        scrollIntoView.mockClear()
        let next = root.querySelector('[data-yorozu-media-thumb][data-index="0"]') as HTMLButtonElement
        let nextScroll = vi.fn()
        next.scrollIntoView = nextScroll
        viewer.goTo(0)
        expect(next.hasAttribute("data-current")).toBe(true)
        expect(nextScroll).toHaveBeenCalledWith({ inline: "center", block: "nearest" })
        let mid = root.querySelector('[data-yorozu-media-thumb][data-index="1"]') as HTMLButtonElement
        let midScroll = vi.fn()
        mid.scrollIntoView = midScroll
        viewer.next()
        expect(mid.hasAttribute("data-current")).toBe(true)
        expect(midScroll).toHaveBeenCalledWith({ inline: "center", block: "nearest" })
        let firstScroll = vi.fn()
        next.scrollIntoView = firstScroll
        viewer.prev("swipe")
        expect(next.hasAttribute("data-current")).toBe(true)
        expect(firstScroll).toHaveBeenCalledWith({ inline: "center", block: "nearest" })
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
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

    it("wheel on the filmstrip is not trapped", () => {
        viewer.open({ items: [img("a"), img("b")] })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        let chromeWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        nav.dispatchEvent(chromeWheel)
        expect(chromeWheel.defaultPrevented).toBe(false)
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        let stageWheel = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true })
        viewport.dispatchEvent(stageWheel)
        expect(stageWheel.defaultPrevented).toBe(true)
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
})
