// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import { fitContain, stageContentSize } from "../layout"
import type { MediaViewerChromeApi, MediaViewerItem } from "../types"
import { readPadding } from "./css"
import {
    DecodeFn,
    flushLiveRaf,
    img,
    imgAspect,
    mountAttach,
    origin,
    pointer,
    teardownAttach,
    type AttachTestMount,
} from "./test-helpers"

function stubClientBox(el: HTMLElement, width: number, height: number): void {
    Object.defineProperty(el, "clientWidth", { configurable: true, get: () => width })
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => height })
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
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        let backdrop = overlay.querySelector("[data-yorozu-media-backdrop]") as HTMLElement
        expect(backdrop).toBeTruthy()
        expect(overlay.firstElementChild).toBe(backdrop)
    })

    it("decode port paints peek from bitmap and does not assign item.src", async () => {
        let imgItem = img
        let decoded = document.createElement("img")
        decoded.src = "blob:decoded"
        let decode = vi.fn<DecodeFn>(async (req) => {
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
        let decode = vi.fn<DecodeFn>((req) => {
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
        let decode = vi.fn<DecodeFn>(async (req) => {
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

    it("loading-only pane has no contain clip", () => {
        viewer.open({ items: [{ id: "a", kind: "image", src: null }] })
        expect(root.querySelector("[data-yorozu-media-loading]")).toBeTruthy()
        expect(root.querySelector("[data-yorozu-media-clip]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-stage]")).toBeNull()
        viewer.setNeighbors({
            older: { id: "x", kind: "image", src: null },
            newer: { id: "y", kind: "video", src: "y.mp4" },
        })
        expect(root.querySelector('[data-side="older"] [data-yorozu-media-loading]')).toBeTruthy()
        expect(root.querySelector('[data-side="older"] [data-yorozu-media-clip]')).toBeNull()
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-loading]')).toBeTruthy()
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-clip]')).toBeNull()
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
        let decode = vi.fn<DecodeFn>(async (req) => {
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
        let decode = vi.fn<DecodeFn>(async () => decoded)
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

    it("failed decode clears the peek spinner", async () => {
        let decode = vi.fn<DecodeFn>(async (req) => {
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
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-clip]')).toBeNull()
    })

    it("compat img.src active onerror clears the stage", () => {
        viewer.open({ items: [img("a")] })
        let image = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(image).toBeTruthy()
        expect(root.querySelector("[data-yorozu-media-clip]")).toBeTruthy()
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeTruthy()
        image.dispatchEvent(new Event("error"))
        expect(root.querySelector("[data-yorozu-media-stage]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-loading]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-clip]")).toBeNull()
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeNull()
    })

    it("wraps zoomable stage, video, and peek in a contain clip", () => {
        viewer.open({
            items: [img("a"), { id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }],
            index: 0,
        })
        let activeStage = root.querySelector("[data-side=active] [data-yorozu-media-stage]") as HTMLElement
        let activeClip = activeStage.closest("[data-yorozu-media-clip]") as HTMLElement
        let zoom = root.querySelector("[data-side=active] [data-yorozu-media-zoom]") as HTMLElement
        expect(activeClip).toBeTruthy()
        expect(activeClip.contains(activeStage)).toBe(true)
        expect(zoom.contains(activeClip)).toBe(true)
        let peek = root.querySelector("[data-side=newer] [data-yorozu-media-peek]") as HTMLElement
        let peekClip = peek.closest("[data-yorozu-media-clip]") as HTMLElement
        expect(peekClip).toBeTruthy()
        expect(peekClip.contains(peek)).toBe(true)
    })

    it("wraps active video in a clip without a zoom wrapper", () => {
        viewer.open({
            items: [{ id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }],
        })
        let video = root.querySelector("video") as HTMLVideoElement
        let clip = video.closest("[data-yorozu-media-clip]") as HTMLElement
        expect(clip).toBeTruthy()
        expect(clip.contains(video)).toBe(true)
        expect(root.querySelector("[data-yorozu-media-zoom]")).toBeNull()
    })

    it("video loadeddata restamps the clip from videoWidth, not the content-box pin", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({
            items: [{ id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }],
        })
        let video = root.querySelector("video") as HTMLVideoElement
        let clip = video.closest("[data-yorozu-media-clip]") as HTMLElement
        let pane = root.querySelector("[data-side=active]") as HTMLElement
        stubClientBox(pane, 800, 600)
        flushLiveRaf()
        let content = stageContentSize(pane.clientWidth, pane.clientHeight, readPadding(pane))
        expect(content.width).toBeGreaterThan(0)
        expect(content.height).toBeGreaterThan(0)
        expect(clip.style.width).toBe(`${content.width}px`)
        expect(clip.style.height).toBe(`${content.height}px`)
        Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 })
        Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 })
        let fit = fitContain({ width: 1920, height: 1080 }, content)
        expect(fit).toBeTruthy()
        expect(fit!.height).not.toBe(content.height)
        video.dispatchEvent(new Event("loadeddata"))
        flushLiveRaf()
        expect(clip.style.width).toBe(`${fit!.width}px`)
        expect(clip.style.height).toBe(`${fit!.height}px`)
    })

    it("gif load restamps the clip from natural size, not the content-box pin", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({ items: [{ id: "g", kind: "gif", src: "g.gif" }] })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        let clip = stage.closest("[data-yorozu-media-clip]") as HTMLElement
        let pane = root.querySelector("[data-side=active]") as HTMLElement
        stubClientBox(pane, 800, 600)
        flushLiveRaf()
        let content = stageContentSize(pane.clientWidth, pane.clientHeight, readPadding(pane))
        expect(clip.style.width).toBe(`${content.width}px`)
        expect(clip.style.height).toBe(`${content.height}px`)
        Object.defineProperty(stage, "naturalWidth", { configurable: true, value: 320 })
        Object.defineProperty(stage, "naturalHeight", { configurable: true, value: 240 })
        let fit = fitContain({ width: 320, height: 240 }, content)
        expect(fit).toBeTruthy()
        expect(fit!.width).not.toBe(content.width)
        stage.dispatchEvent(new Event("load"))
        flushLiveRaf()
        expect(clip.style.width).toBe(`${fit!.width}px`)
        expect(clip.style.height).toBe(`${fit!.height}px`)
    })

    it("peek load restamps the clip from natural size, not the content-box pin", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        viewer.open({
            items: [img("a"), { id: "g", kind: "gif", src: "g.gif" }],
            index: 0,
        })
        let peek = root.querySelector("[data-side=newer] [data-yorozu-media-peek]") as HTMLImageElement
        let clip = peek.closest("[data-yorozu-media-clip]") as HTMLElement
        let pane = root.querySelector("[data-side=newer]") as HTMLElement
        stubClientBox(pane, 800, 600)
        flushLiveRaf()
        let content = stageContentSize(pane.clientWidth, pane.clientHeight, readPadding(pane))
        expect(clip.style.width).toBe(`${content.width}px`)
        expect(clip.style.height).toBe(`${content.height}px`)
        Object.defineProperty(peek, "naturalWidth", { configurable: true, value: 320 })
        Object.defineProperty(peek, "naturalHeight", { configurable: true, value: 240 })
        let fit = fitContain({ width: 320, height: 240 }, content)
        expect(fit).toBeTruthy()
        expect(fit!.width).not.toBe(content.width)
        peek.dispatchEvent(new Event("load"))
        flushLiveRaf()
        expect(clip.style.width).toBe(`${fit!.width}px`)
        expect(clip.style.height).toBe(`${fit!.height}px`)
    })
})
