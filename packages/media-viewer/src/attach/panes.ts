import { applyCanvasImageSource, type MediaDecodePort, type MediaDecodeRole } from "../decode"
import type { MediaViewer, MediaViewerItem, MediaViewerNeighbor, MediaViewerSnapshot } from "../types"
import { isZoomable } from "./css"

export type AttachPanes = {
    paintPanes: (snap: MediaViewerSnapshot) => void
    reset: () => void
}

export function createPanes(opts: {
    getStrip: () => HTMLElement | null
    viewer: MediaViewer
    decodePort: MediaDecodePort
    isDetached: () => boolean
    reducedMotion: () => boolean
    measureZoom: () => void
}): AttachPanes {
    let paneKeys = new WeakMap<HTMLElement, string>()
    let paneIds: { older?: string; active?: string; newer?: string } = {}

    function placePane(el: HTMLElement, side: "older" | "active" | "newer"): void {
        let strip = opts.getStrip()
        if (!strip) return
        if (side === "older") {
            strip.insertBefore(el, strip.firstChild)
            return
        }
        if (side === "newer") {
            strip.append(el)
            return
        }
        let newer = strip.querySelector('[data-side="newer"]')
        if (newer) strip.insertBefore(el, newer)
        else strip.append(el)
    }

    function paneContentKey(side: string, item: MediaViewerItem | MediaViewerNeighbor): string {
        let poster = "poster" in item && item.poster ? item.poster : ""
        let alt = "alt" in item && item.alt ? item.alt : ""
        let motion = opts.reducedMotion() ? "rm" : "full"
        return `${side}:${item.id}:${item.kind}:${item.src ?? ""}:${poster}:${alt}:${motion}`
    }

    function peekBitmapSrc(item: MediaViewerNeighbor): string | null {
        if (item.kind === "video") {
            return typeof item.poster === "string" && item.poster.length > 0 ? item.poster : null
        }
        return item.src ?? null
    }

    function fillPeek(pane: HTMLElement, item: MediaViewerNeighbor, side: "older" | "newer"): void {
        let hostDecode = opts.viewer.decodeFn()
        let src = peekBitmapSrc(item)
        if (hostDecode && src) {
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            pane.append(loading)
            let key = paneKeys.get(pane)
            let role: MediaDecodeRole = side === "older" ? "peek-older" : "peek-newer"
            void opts.decodePort
                .request({ id: item.id, role, src, decode: hostDecode })
                .then((source: CanvasImageSource | null): void => {
                    if (opts.isDetached() || !pane.isConnected || paneKeys.get(pane) !== key) return
                    pane.replaceChildren()
                    if (source) applyCanvasImageSource(pane, source, { peek: true, alt: "" })
                })
            return
        }
        if (item.kind === "video") {
            let poster = item.poster
            if (typeof poster === "string" && poster.length > 0) {
                let image = document.createElement("img")
                image.setAttribute("data-yorozu-media-peek", "")
                image.alt = ""
                image.draggable = false
                let key = paneKeys.get(pane)
                image.onerror = (): void => {
                    if (opts.isDetached() || !pane.isConnected || paneKeys.get(pane) !== key) return
                    pane.replaceChildren()
                }
                pane.append(image)
                image.src = poster
                return
            }
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            pane.append(loading)
            return
        }
        if (item.src) {
            let image = document.createElement("img")
            image.setAttribute("data-yorozu-media-peek", "")
            image.alt = ""
            image.draggable = false
            let key = paneKeys.get(pane)
            image.onerror = (): void => {
                if (opts.isDetached() || !pane.isConnected || paneKeys.get(pane) !== key) return
                pane.replaceChildren()
            }
            pane.append(image)
            image.src = item.src
            return
        }
        let loading = document.createElement("div")
        loading.setAttribute("data-yorozu-media-loading", "")
        pane.append(loading)
    }

    function activeBitmapSrc(item: MediaViewerItem | MediaViewerNeighbor): string | null {
        if (item.kind === "gif" && opts.reducedMotion()) {
            return item.poster || item.src || null
        }
        return item.src || null
    }

    function fillActive(pane: HTMLElement, item: MediaViewerItem | MediaViewerNeighbor): void {
        if (item.kind === "video") {
            let video = document.createElement("video")
            video.setAttribute("data-yorozu-media-stage", "")
            video.controls = true
            video.autoplay = true
            video.playsInline = true
            video.setAttribute("playsinline", "")
            if (item.src) video.src = item.src
            if ("poster" in item && item.poster) video.poster = item.poster
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            pane.append(video, loading)
            let clearLoading = (): void => {
                loading.remove()
                video.removeEventListener("loadeddata", clearLoading)
            }
            video.addEventListener("loadeddata", clearLoading)
            return
        }
        let src = activeBitmapSrc(item)
        if (!src) {
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            pane.append(loading)
            return
        }
        let hostDecode = opts.viewer.decodeFn()
        let zoomable = isZoomable(item)
        let host: HTMLElement = pane
        if (zoomable) {
            let wrap = document.createElement("div")
            wrap.setAttribute("data-yorozu-media-zoom", "")
            pane.append(wrap)
            host = wrap
        }
        if (hostDecode) {
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            host.append(loading)
            let key = paneKeys.get(pane)
            let alt = "alt" in item && item.alt ? item.alt : ""
            void opts.decodePort
                .request({ id: item.id, role: "active", src, decode: hostDecode })
                .then((source: CanvasImageSource | null): void => {
                    if (opts.isDetached() || !pane.isConnected || paneKeys.get(pane) !== key) return
                    host.replaceChildren()
                    if (source) {
                        let painted = applyCanvasImageSource(host, source, { stage: true, alt })
                        if (zoomable && painted instanceof HTMLImageElement) {
                            painted.addEventListener("load", () => opts.measureZoom())
                            if (painted.complete) opts.measureZoom()
                            return
                        }
                    }
                    if (zoomable) opts.measureZoom()
                })
            return
        }
        let image = document.createElement("img")
        image.setAttribute("data-yorozu-media-stage", "")
        image.alt = "alt" in item && item.alt ? item.alt : ""
        image.draggable = false
        let key = paneKeys.get(pane)
        image.onerror = (): void => {
            if (opts.isDetached() || !pane.isConnected || paneKeys.get(pane) !== key) return
            host.replaceChildren()
        }
        if (zoomable) image.addEventListener("load", () => opts.measureZoom())
        host.append(image)
        image.src = src
        if (zoomable && image.complete) opts.measureZoom()
    }

    function syncPane(
        side: "older" | "active" | "newer",
        item: MediaViewerItem | MediaViewerNeighbor | null,
        keep: Set<string>,
    ): void {
        let strip = opts.getStrip()
        if (!strip) return
        let existing = strip.querySelector(`[data-side="${side}"]`) as HTMLElement | null
        let prevId = paneIds[side]
        if (item == null) {
            existing?.remove()
            delete paneIds[side]
            if (opts.viewer.decodeFn() && prevId && !keep.has(prevId)) opts.decodePort.abort(prevId)
            return
        }
        let key = paneContentKey(side, item)
        if (!existing) {
            existing = document.createElement("div")
            existing.setAttribute("data-yorozu-media-pane", "")
            existing.setAttribute("data-side", side)
            placePane(existing, side)
        } else if (paneKeys.get(existing) === key) {
            return
        } else if (opts.viewer.decodeFn() && prevId && !keep.has(prevId)) {
            opts.decodePort.abort(prevId)
        }
        paneIds[side] = item.id
        paneKeys.set(existing, key)
        existing.replaceChildren()
        if (side === "active") fillActive(existing, item)
        else fillPeek(existing, item, side)
    }

    function paintPanes(snap: MediaViewerSnapshot): void {
        let keep = new Set<string>()
        if (snap.neighbors.older) keep.add(snap.neighbors.older.id)
        if (snap.current) keep.add(snap.current.id)
        if (snap.neighbors.newer) keep.add(snap.neighbors.newer.id)
        if (opts.viewer.decodeFn() && opts.viewer.isGesturing()) opts.decodePort.abortExcept(keep)
        syncPane("older", snap.neighbors.older, keep)
        syncPane("active", snap.current, keep)
        syncPane("newer", snap.neighbors.newer, keep)
    }

    function reset(): void {
        paneIds = {}
        paneKeys = new WeakMap()
    }

    return { paintPanes, reset }
}
