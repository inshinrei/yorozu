/**
 * Origin seed capture from a thumb stamped with data-media-origin.
 */
import type { MediaViewerOrigin } from "./types"

export const MEDIA_ORIGIN_ATTR: string = "data-media-origin"

function escapeAttrValue(id: string): string {
    return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function originSelector(attr: string, id: string): string {
    return `[${attr}="${escapeAttrValue(id)}"]`
}

export function mediaOriginSelector(id: string): string {
    return originSelector(MEDIA_ORIGIN_ATTR, id)
}

function queryOrigin(id: string, root: ParentNode | undefined, attr: string): HTMLElement | null {
    let scope: ParentNode | undefined | null = root
    if (scope == null) {
        if (typeof document === "undefined") return null
        scope = document
    }
    try {
        let found = scope.querySelector(originSelector(attr, id))
        if (found instanceof HTMLElement) return found
    } catch {
        // invalid selectors fall back to an attribute scan
    }
    let nodes = scope.querySelectorAll(`[${attr}]`)
    for (let node of nodes) {
        if (node instanceof HTMLElement && node.getAttribute(attr) === id) return node
    }
    return null
}

export function queryMediaOriginEl(id: string, root?: ParentNode): HTMLElement | null {
    return queryOrigin(id, root, MEDIA_ORIGIN_ATTR)
}

function resolveMediaEl(el: HTMLElement): HTMLElement {
    if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) return el
    let img = el.querySelector("img")
    if (img) return img
    let video = el.querySelector("video")
    if (video) return video
    return el
}

function readImageUrl(el: HTMLElement): string | null {
    if (el instanceof HTMLImageElement) {
        let url = el.currentSrc || el.src
        return url ? url : null
    }
    if (el instanceof HTMLVideoElement) {
        let url = el.poster
        return url ? url : null
    }
    return null
}

function readObjectFit(el: HTMLElement): "cover" | "contain" | null {
    let inline = el.style.objectFit
    if (inline === "cover" || inline === "contain") return inline
    if (typeof getComputedStyle !== "function") return null
    let computed = getComputedStyle(el).objectFit
    if (computed === "cover" || computed === "contain") return computed
    return null
}

export function captureOriginFromDom(
    id: string,
    opts?: {
        naturalWidth?: number
        naturalHeight?: number
        objectFit?: "cover" | "contain"
        root?: ParentNode
        attr?: string
    },
): MediaViewerOrigin | null {
    let attr = opts?.attr ?? MEDIA_ORIGIN_ATTR
    let el = queryOrigin(id, opts?.root, attr)
    if (!el) return null
    let box = el.getBoundingClientRect()
    if (!(box.width > 0) || !(box.height > 0)) return null
    let media = resolveMediaEl(el)
    let imageUrl = readImageUrl(media)
    let objectFit = opts?.objectFit ?? readObjectFit(media) ?? readObjectFit(el) ?? "cover"
    let origin: MediaViewerOrigin = {
        id,
        rect: { top: box.top, left: box.left, width: box.width, height: box.height },
        imageUrl,
        objectFit,
    }
    let naturalWidth = opts?.naturalWidth
    let naturalHeight = opts?.naturalHeight
    if (naturalWidth == null && media instanceof HTMLImageElement && media.naturalWidth > 0) {
        naturalWidth = media.naturalWidth
    }
    if (naturalHeight == null && media instanceof HTMLImageElement && media.naturalHeight > 0) {
        naturalHeight = media.naturalHeight
    }
    if (naturalWidth && naturalWidth > 0) origin.naturalWidth = naturalWidth
    if (naturalHeight && naturalHeight > 0) origin.naturalHeight = naturalHeight
    return origin
}
