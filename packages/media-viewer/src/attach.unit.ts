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
})
