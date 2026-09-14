// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./attach"
import {
    MEDIA_GHOST_ANIMATING_CLASS,
    MEDIA_GHOST_CLOSE_EASING,
    MEDIA_GHOST_CLOSE_MS,
    MEDIA_GHOST_EASING,
    MEDIA_GHOST_MS,
} from "./ghost"
import { createMediaViewer, filmstripItemSizes, type MediaViewer } from "./session"
import { MEDIA_SWIPE_WHEEL_COOLDOWN_MS, MEDIA_SWIPE_WHEEL_RELEASE_MS } from "./swipe"
import type { MediaViewerChromeApi, MediaViewerItem, MediaViewerOrigin, MediaVisibleIds } from "./types"
import { MEDIA_WHEEL_ZOOM_RELEASE_MS, MEDIA_ZOOM_SETTLE_MS } from "./zoom"

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
        vi.useRealTimers()
        stop?.()
        stop = undefined
        viewer.destroy()
        root.remove()
        document.documentElement.classList.remove(MEDIA_GHOST_ANIMATING_CLASS)
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
        Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
        Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect")
        Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth")
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

    it("decode port paints peek from bitmap and does not assign item.src", async () => {
        let imgItem = img
        let decoded = document.createElement("img")
        decoded.src = "blob:decoded"
        let decode = vi.fn(async (req: { id: string; role: string }) => {
            if (req.role === "peek-newer" && req.id === "b") return decoded
            let other = document.createElement("img")
            other.src = `blob:${req.role}:${req.id}`
            return other
        })
        viewer.destroy()
        viewer = createMediaViewer({ decode, onIndexChange })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({
            items: [imgItem("a"), imgItem("b")],
            index: 0,
            neighbors: {
                older: null,
                newer: { id: "b", kind: "image", src: "b.jpg" },
            },
        })
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-peek]')).toBeNull()
        await vi.waitFor(() => {
            expect(root.querySelector('[data-side="newer"] [data-yorozu-media-peek]')).toBe(decoded)
        })
        expect(decode).toHaveBeenCalled()
        let req = decode.mock.calls.find((call) => (call[0] as { role: string }).role === "peek-newer")![0] as {
            role: string
            src: string
            id: string
        }
        expect(req).toMatchObject({ id: "b", role: "peek-newer", src: "b.jpg" })
        expect(root.querySelector('[data-side="newer"] img[src="b.jpg"]')).toBeNull()
    })

    it("close aborts leftover decode so a later open is not stuck behind it", async () => {
        let started: string[] = []
        let decode = vi.fn((req: { id: string; role: string; signal: AbortSignal }) => {
            started.push(`${req.role}:${req.id}`)
            return new Promise<CanvasImageSource | null>((resolve) => {
                req.signal.addEventListener("abort", () => resolve(null))
            })
        })
        viewer.destroy()
        viewer = createMediaViewer({ decode, onIndexChange })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        await vi.waitFor(() => expect(started).toContain("active:a"))
        api!.forceClose()
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        started.length = 0
        viewer.open({ items: [img("z")] })
        await vi.waitFor(() => expect(started).toContain("active:z"))
    })

    it("does not start peek decode while swipe is gesturing; resumes after settle", async () => {
        let started: string[] = []
        let decode = vi.fn(async (req: { id: string; role: string }) => {
            started.push(`${req.role}:${req.id}`)
            return document.createElement("img")
        })
        viewer.destroy()
        viewer = createMediaViewer({ decode, onIndexChange })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a"), img("b"), img("c")],
            index: 1,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        await vi.waitFor(() => expect(started.length).toBeGreaterThan(0))
        started.length = 0
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 140, clientY: 200 }))
        expect(viewer.isGesturing()).toBe(true)
        expect(api!.isGesturing()).toBe(true)
        viewer.setNeighbors({
            older: { id: "x", kind: "image", src: "x.jpg" },
            newer: { id: "y", kind: "image", src: "y.jpg" },
        })
        await Promise.resolve()
        expect(started.some((s) => s.startsWith("peek-"))).toBe(false)
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewport.dispatchEvent(pointer("pointerup", { clientX: 140, clientY: 200 }))
        vi.advanceTimersByTime(400)
        vi.useRealTimers()
        await vi.waitFor(() => expect(started.some((s) => s.startsWith("peek-"))).toBe(true))
        expect(viewer.isGesturing()).toBe(false)
        expect(api!.isGesturing()).toBe(false)
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

    it('ArrowRight sets lastNav to "next" for opaque ids', () => {
        viewer.open({ items: [img("aa"), img("bb")], index: 0 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.lastNav()).toBe("next")
    })

    it('chrome api next/prev set lastNav to "next"/"prev" for opaque ids', () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("aa"), img("bb")],
            index: 0,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        api!.next()
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.lastNav()).toBe("next")
        api!.prev()
        expect(viewer.snapshot().index).toBe(0)
        expect(viewer.lastNav()).toBe("prev")
    })

    it("open({ ghost: false, origin }) does not add yorozu-media-ghost-animating", () => {
        viewer.open({ items: [img("a")], origin, ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeTruthy()
        expect(document.documentElement.classList.contains("yorozu-media-ghost-animating")).toBe(false)
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(false)
        expect(animate).not.toHaveBeenCalled()
    })

    it("open ghost uses the stage img as bitmap and does not steal the stage node", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        viewer.open({
            items: [img("a", "blob:stage-a")],
            origin: { ...origin, imageUrl: "https://cdn.example/thumb.jpg" },
            ghost: true,
        })
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost] img")).toBeTruthy()
        })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage).toBeInstanceOf(HTMLImageElement)
        expect(stage.src).toContain("blob:stage-a")
        let cloneImg = ghostHost.querySelector("[data-yorozu-media-ghost] img") as HTMLImageElement
        expect(cloneImg).not.toBe(stage)
        expect(cloneImg.src).toContain("blob:stage-a")
        expect(cloneImg.src).not.toContain("cdn.example")
        expect(root.querySelector("[data-yorozu-media-stage]")).toBe(stage)
        ghostHost.remove()
    })

    it("open ghost play uses MEDIA_GHOST_MS and MEDIA_GHOST_EASING", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        viewer.open({
            items: [img("a")],
            origin,
            ghost: true,
        })
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost]")).toBeTruthy()
        })
        await vi.waitFor(() => {
            expect(animate.mock.calls.length).toBeGreaterThan(0)
            expect(animate.mock.calls.at(-1)?.[1]).toMatchObject({
                duration: MEDIA_GHOST_MS,
                easing: MEDIA_GHOST_EASING,
                fill: "forwards",
            })
        })
        ghostHost.remove()
    })

    it("video open ghost does not use a neighbor peek as bitmap", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        viewer.open({
            items: [{ id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }, img("b", "neighbor-b.jpg")],
            index: 0,
            origin: { ...origin, id: "v", imageUrl: "https://cdn.example/video-thumb.jpg" },
            ghost: true,
            neighbors: {
                older: null,
                newer: { id: "b", kind: "image", src: "neighbor-b.jpg" },
            },
        })
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-peek]')).toBeTruthy()
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost] img")).toBeTruthy()
        })
        let cloneImg = ghostHost.querySelector("[data-yorozu-media-ghost] img") as HTMLImageElement
        expect(cloneImg.src).not.toContain("neighbor-b")
        expect(cloneImg.src).toContain("video-thumb")
        ghostHost.remove()
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
        expect(root.querySelector('[data-side="active"] [data-yorozu-media-loading]')).toBeTruthy()
        video.dispatchEvent(new Event("loadeddata"))
        expect(root.querySelector('[data-side="active"] [data-yorozu-media-loading]')).toBeNull()
    })

    it("video peek without poster paints loading, not img[src$=mp4]", () => {
        viewer.open({
            items: [img("a"), { id: "v", kind: "video", src: "v.mp4" }],
            index: 0,
        })
        let newer = root.querySelector('[data-side="newer"]') as HTMLElement
        expect(newer.querySelector("[data-yorozu-media-loading]")).toBeTruthy()
        expect(newer.querySelector("img[src$='.mp4']")).toBeNull()
        expect(newer.querySelector("[data-yorozu-media-peek]")).toBeNull()
    })

    it("video peek with poster paints peek img from poster, not video src", () => {
        viewer.open({
            items: [img("a"), { id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }],
            index: 0,
        })
        let peek = root.querySelector('[data-side="newer"] [data-yorozu-media-peek]') as HTMLImageElement
        expect(peek).toBeInstanceOf(HTMLImageElement)
        expect(peek.getAttribute("src")).toBe("p.jpg")
        expect(root.querySelector('[data-side="newer"] img[src$=".mp4"]')).toBeNull()
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-loading]')).toBeNull()
    })

    it("gif paints img stage, does not zoom, and uses poster when motion is reduced", () => {
        stop?.()
        stop = attachMediaViewer(viewer, root, { prefersReducedMotion: () => true })
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [{ id: "g", kind: "gif", src: "g.gif", poster: "g.jpg" }],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage.tagName).toBe("IMG")
        expect(stage.getAttribute("src")).toBe("g.jpg")
        api!.zoomIn()
        expect(api!.scale()).toBe(1)
    })

    it("gif uses src when motion is on and chrome zoomIn is a no-op", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [{ id: "g", kind: "gif", src: "g.gif" }],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage.getAttribute("src")).toBe("g.gif")
        api!.zoomIn()
        expect(api!.scale()).toBe(1)
    })

    it("gif has no zoom wrap and reduced motion without poster still uses src", () => {
        viewer.open({ items: [{ id: "g", kind: "gif", src: "g.gif" }] })
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-stage]")?.tagName).toBe("IMG")
        stop?.()
        stop = attachMediaViewer(viewer, root, { prefersReducedMotion: () => true })
        viewer.open({ items: [{ id: "g", kind: "gif", src: "g.gif" }] })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage.tagName).toBe("IMG")
        expect(stage.getAttribute("src")).toBe("g.gif")
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeNull()
    })

    it("gif neighbor peeks like an image from src, not poster", () => {
        viewer.open({
            items: [img("a"), { id: "g", kind: "gif", src: "g.gif", poster: "g.jpg" }],
            index: 0,
        })
        let peek = root.querySelector('[data-side="newer"] [data-yorozu-media-peek]') as HTMLImageElement
        expect(peek).toBeInstanceOf(HTMLImageElement)
        expect(peek.getAttribute("src")).toBe("g.gif")
        expect(root.querySelector('[data-side="newer"] img[src="g.jpg"]')).toBeNull()
    })

    it("gif decode uses active role and does not wrap zoom", async () => {
        let decoded = document.createElement("img")
        decoded.src = "blob:gif"
        let decode = vi.fn(async (req: { id: string; role: string; src: string }) => {
            if (req.role === "active" && req.id === "g") return decoded
            let other = document.createElement("img")
            other.src = `blob:${req.role}:${req.id}`
            return other
        })
        viewer.destroy()
        viewer = createMediaViewer({ decode, onIndexChange })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({ items: [{ id: "g", kind: "gif", src: "g.gif", poster: "g.jpg" }] })
        await vi.waitFor(() => {
            expect(root.querySelector("[data-yorozu-media-stage]")).toBe(decoded)
        })
        let req = decode.mock.calls.find((call) => (call[0] as { role: string }).role === "active")![0] as {
            id: string
            role: string
            src: string
        }
        expect(req).toMatchObject({ id: "g", role: "active", src: "g.gif" })
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeNull()
    })

    it("gif decode under reduced motion uses poster", async () => {
        let decoded = document.createElement("img")
        decoded.src = "blob:gif-poster"
        let decode = vi.fn(async () => decoded)
        viewer.destroy()
        viewer = createMediaViewer({ decode, onIndexChange })
        stop?.()
        stop = attachMediaViewer(viewer, root, { prefersReducedMotion: () => true })
        viewer.open({ items: [{ id: "g", kind: "gif", src: "g.gif", poster: "g.jpg" }] })
        await vi.waitFor(() => {
            expect(root.querySelector("[data-yorozu-media-stage]")).toBe(decoded)
        })
        expect(decode.mock.calls[0]![0]).toMatchObject({ id: "g", role: "active", src: "g.jpg" })
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeNull()
    })

    it("gif with poster remounts to poster when prefersReducedMotion flips to true", () => {
        stop?.()
        let rm = false
        stop = attachMediaViewer(viewer, root, { prefersReducedMotion: () => rm })
        let gif: MediaViewerItem = { id: "g", kind: "gif", src: "g.gif", poster: "g.jpg" }
        viewer.open({ items: [gif] })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage.getAttribute("src")).toBe("g.gif")
        rm = true
        viewer.setItems([gif])
        stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage.getAttribute("src")).toBe("g.jpg")
    })

    it("gif swipe still navigates", () => {
        viewer.open({
            items: [{ id: "g", kind: "gif", src: "g.gif" }, img("b")],
            index: 0,
            filmstrip: false,
        })
        let viewport = root.querySelector("[data-yorozu-media-viewport]") as HTMLElement
        viewport.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointermove", { clientX: 300, clientY: 200 }))
        viewport.dispatchEvent(pointer("pointerup", { clientX: 300, clientY: 200 }))
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.lastNav()).toBe("swipe")
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

    it("chrome onZoomChange fires on zoomIn and not on session identity", () => {
        let api: MediaViewerChromeApi | undefined
        let zoomTicks = 0
        let sessionTicks = 0
        viewer.subscribe(() => {
            sessionTicks += 1
        })
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                    return chromeApi.onZoomChange(() => {
                        zoomTicks += 1
                    })
                },
            },
        })
        let afterOpen = sessionTicks
        api!.zoomIn()
        expect(api!.scale()).toBe(1.25)
        expect(zoomTicks).toBeGreaterThanOrEqual(1)
        expect(sessionTicks).toBe(afterOpen)
    })

    it("chrome onZoomChange from a closed overlay does not fire after reopen", () => {
        let api: MediaViewerChromeApi | undefined
        let firstTicks = 0
        let secondTicks = 0
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                    chromeApi.onZoomChange(() => {
                        firstTicks += 1
                    })
                },
            },
        })
        api!.zoomIn()
        expect(firstTicks).toBeGreaterThanOrEqual(1)
        let afterFirstZoom = firstTicks
        api!.close({ ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                    chromeApi.onZoomChange(() => {
                        secondTicks += 1
                    })
                },
            },
        })
        api!.zoomIn()
        expect(firstTicks).toBe(afterFirstZoom)
        expect(secondTicks).toBeGreaterThanOrEqual(1)
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

    it("origin open stays opening until ghost lands; data-scrim follows the open tick", async () => {
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
        expect(overlay.getAttribute("data-phase")).toBe("opening")
        expect(overlay.hasAttribute("data-scrim")).toBe(false)

        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
        expect(overlay.getAttribute("data-phase")).toBe("opening")
        expect(overlay.hasAttribute("data-scrim")).toBe(true)

        await vi.waitFor(() => {
            expect(overlay.getAttribute("data-phase")).toBe("open")
        })
        expect(overlay.hasAttribute("data-scrim")).toBe(true)

        api!.close()
        expect(overlay.getAttribute("data-phase")).toBe("closing")
        expect(overlay.hasAttribute("data-scrim")).toBe(false)
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

    it("close ghost uses the stage img as bitmap and does not steal the stage node", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a", "blob:stage-a")],
            origin: { ...origin, imageUrl: "https://cdn.example/thumb.jpg" },
            ghost: true,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        await vi.waitFor(() => {
            expect(root.querySelector("[data-yorozu-media-stage]")).toBeTruthy()
        })
        api!.close()
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost] img")).toBeTruthy()
        })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage).toBeInstanceOf(HTMLImageElement)
        let cloneImg = ghostHost.querySelector("[data-yorozu-media-ghost] img") as HTMLImageElement
        expect(cloneImg).not.toBe(stage)
        expect(cloneImg.src).toContain("blob:stage-a")
        expect(cloneImg.src).not.toContain("cdn.example")
        expect(root.querySelector("[data-yorozu-media-stage]")).toBe(stage)
        ghostHost.remove()
    })

    it("close ghost play uses MEDIA_GHOST_CLOSE_MS and MEDIA_GHOST_CLOSE_EASING", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
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
        await vi.waitFor(() => {
            expect(root.querySelector("[data-yorozu-media-stage]")).toBeTruthy()
        })
        animate.mockClear()
        api!.close()
        await vi.waitFor(() => {
            expect(animate.mock.calls.length).toBeGreaterThan(0)
            expect(animate.mock.calls.at(-1)?.[1]).toMatchObject({
                duration: MEDIA_GHOST_CLOSE_MS,
                easing: MEDIA_GHOST_CLOSE_EASING,
                fill: "forwards",
            })
        })
        ghostHost.remove()
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
        let target = nav.querySelector('[data-yorozu-media-thumb][data-index="2"]') as HTMLElement
        expect(target).toBeTruthy()
        Object.defineProperty(nav, "scrollLeft", { configurable: true, value: 40, writable: true })
        let stripBox = {
            left: 100,
            width: 200,
            top: 0,
            height: 40,
            right: 300,
            bottom: 40,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        }
        let thumbBox = {
            left: 280,
            width: 60,
            top: 0,
            height: 40,
            right: 340,
            bottom: 40,
            x: 280,
            y: 0,
            toJSON: () => ({}),
        }
        nav.getBoundingClientRect = () => stripBox as DOMRect
        target.getBoundingClientRect = () => thumbBox as DOMRect
        scrollTo.mockClear()
        viewer.goTo(2)
        let thumbMid = thumbBox.left + thumbBox.width / 2
        let stripMid = stripBox.left + stripBox.width / 2
        let expectedLeft = 40 + thumbMid - stripMid
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
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 20 * 40 + 20 - 100 }))
        expect(nav.querySelector("[data-current]")?.getAttribute("data-index")).toBe("20")
    })

    it("virtualized mixed-pitch centerCurrentThumb uses rowTop and current pitch", () => {
        let items = Array.from({ length: 40 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 0, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 200, configurable: true })
        let scrollTo = vi.fn()
        nav.scrollTo = scrollTo as unknown as typeof nav.scrollTo
        viewer.goTo(20)
        let sizes = filmstripItemSizes()
        let rowTop = 20 * sizes.neighbor
        let left = rowTop + sizes.current / 2 - 100
        let totalSize = 39 * sizes.neighbor + sizes.current
        let maxLeft = Math.max(0, totalSize - 200)
        if (left < 0) left = 0
        if (left > maxLeft) left = maxLeft
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
        expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 1400 }))
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
        let items = Array.from({ length: 10 }, (_, i) => img(`id-${i}`))
        viewer.open({ items, index: 2, filmstrip: { virtualize: true } })
        let nav = root.querySelector("[data-yorozu-media-filmstrip]") as HTMLElement
        Object.defineProperty(nav, "clientWidth", { value: 400, configurable: true })
        viewer.setItems(items, 2)
        let sizes = filmstripItemSizes()
        let current = nav.querySelector("[data-current]") as HTMLElement
        expect(current.style.left).toBe(`${2 * sizes.neighbor}px`)
        expect(current.style.width).toBe(`${sizes.current}px`)
        let neighbor = [...nav.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "3",
        ) as HTMLElement
        expect(neighbor.style.left).toBe(`${2 * sizes.neighbor + sizes.current}px`)
        expect(neighbor.style.width).toBe(`${sizes.neighbor}px`)
        expect(Number.parseFloat(current.style.left) + Number.parseFloat(current.style.width)).toBe(
            Number.parseFloat(neighbor.style.left),
        )
        let before = [...nav.querySelectorAll("[data-yorozu-media-thumb]")].find(
            (el) => el.getAttribute("data-index") === "1",
        ) as HTMLElement
        expect(before.style.width).toBe(`${sizes.neighbor}px`)
        expect(Number.parseFloat(before.style.left) + Number.parseFloat(before.style.width)).toBe(
            Number.parseFloat(current.style.left),
        )
        let track = nav.querySelector('[role="list"]') as HTMLElement
        expect(track.style.width).toBe(`${9 * sizes.neighbor + sizes.current}px`)
    })

    it("failed decode clears the peek spinner", async () => {
        let decode = vi.fn(async (req: { role: string }) => {
            if (req.role === "peek-newer") return null
            return document.createElement("img")
        })
        viewer.destroy()
        viewer = createMediaViewer({ decode, onIndexChange })
        stop?.()
        stop = attachMediaViewer(viewer, root)
        viewer.open({
            items: [img("a"), img("b")],
            index: 0,
            neighbors: {
                older: null,
                newer: { id: "b", kind: "image", src: "b.jpg" },
            },
        })
        await vi.waitFor(() => {
            let pane = root.querySelector('[data-side="newer"]') as HTMLElement
            expect(pane).toBeTruthy()
            expect(pane.querySelector("[data-yorozu-media-loading]")).toBeNull()
            expect(pane.querySelector("img")).toBeNull()
        })
    })

    it("compat img.src peek onerror clears the pane", async () => {
        viewer.open({
            items: [img("a"), img("b")],
            index: 0,
            neighbors: {
                older: null,
                newer: { id: "b", kind: "image", src: "b.jpg" },
            },
        })
        let image = root.querySelector('[data-side="newer"] img') as HTMLImageElement
        expect(image).toBeTruthy()
        image.dispatchEvent(new Event("error"))
        expect(root.querySelector('[data-side="newer"] img')).toBeNull()
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-loading]')).toBeNull()
    })

    it("compat img.src active onerror clears the stage", () => {
        viewer.open({ items: [img("a")] })
        let image = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(image).toBeTruthy()
        image.dispatchEvent(new Event("error"))
        expect(root.querySelector("[data-yorozu-media-stage]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-loading]")).toBeNull()
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
