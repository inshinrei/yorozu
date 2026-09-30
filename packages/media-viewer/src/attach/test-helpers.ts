import { vi, type Mock } from "vitest"
import { attachMediaViewer } from "./index"
import { MEDIA_GHOST_ANIMATING_CLASS, MEDIA_GHOST_HANDOFF_CLASS } from "../ghost"
import { createMediaViewer, type MediaViewer } from "../session"
import type { MediaViewerItem, MediaViewerOrigin, MediaViewerSessionOpts } from "../types"

export type IndexChangeFn = NonNullable<MediaViewerSessionOpts["onIndexChange"]>
export type RequestFn = NonNullable<MediaViewerSessionOpts["onRequestOlder"]>
export type DecodeFn = NonNullable<MediaViewerSessionOpts["decode"]>

export function img(id: string, src: string | null = `${id}.jpg`): MediaViewerItem {
    return { id, kind: "image", src }
}

export function imgAspect(id: string, w: number, h: number): MediaViewerItem {
    return { id, kind: "image", src: `${id}.jpg`, naturalWidth: w, naturalHeight: h }
}

export function pointer(type: string, init: Partial<PointerEventInit>): PointerEvent {
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

export function trapVisibility(el: HTMLElement, onSet: (value: string) => void): () => void {
    let style = el.style
    let current = style.visibility
    Object.defineProperty(style, "visibility", {
        configurable: true,
        enumerable: true,
        get: () => current,
        set: (value: string) => {
            current = String(value)
            onSet(current)
        },
    })
    return (): void => {
        Reflect.deleteProperty(style, "visibility")
        style.visibility = current
    }
}

export function fakeRect(left: number, top: number, width: number, height: number): DOMRect {
    return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON() {
            return {}
        },
    }
}

export function mockViewportBox(viewport: HTMLElement, width = 160, height = 600): void {
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(fakeRect(0, 0, width, height))
}

export function flushLiveRaf(): void {
    vi.advanceTimersByTime(16)
}

export function stampOriginThumb(
    id: string,
    box: { left: number; top: number; width: number; height: number },
): HTMLImageElement {
    let thumb = document.createElement("img")
    thumb.setAttribute("data-media-origin", id)
    thumb.style.visibility = "visible"
    vi.spyOn(thumb, "getBoundingClientRect").mockReturnValue(fakeRect(box.left, box.top, box.width, box.height))
    document.body.append(thumb)
    return thumb
}

export const origin: MediaViewerOrigin = {
    id: "a",
    rect: { top: 10, left: 20, width: 40, height: 40 },
    imageUrl: "a.jpg",
    objectFit: "cover",
    naturalWidth: 200,
    naturalHeight: 200,
}

export type AttachTestMount = {
    viewer: MediaViewer
    root: HTMLElement
    stop: (() => void) | undefined
    animate: ReturnType<typeof vi.fn>
    onIndexChange: Mock<IndexChangeFn>
}

export function mountAttach(opts?: MediaViewerSessionOpts): AttachTestMount {
    let animate = vi.fn(() => ({
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
    let onIndexChange = vi.fn<IndexChangeFn>()
    let viewer = createMediaViewer({ onIndexChange, ...opts })
    let root = document.createElement("div")
    document.body.append(root)
    let stop = attachMediaViewer(viewer, root)
    return { viewer, root, stop, animate, onIndexChange }
}

export function teardownAttach(mount: AttachTestMount): void {
    vi.useRealTimers()
    mount.stop?.()
    mount.stop = undefined
    mount.viewer.destroy()
    mount.root.remove()
    document.documentElement.classList.remove(MEDIA_GHOST_ANIMATING_CLASS, MEDIA_GHOST_HANDOFF_CLASS)
    Reflect.deleteProperty(HTMLElement.prototype, "animate")
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
    Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect")
    Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth")
}
