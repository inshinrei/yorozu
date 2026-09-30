import { dualRaf } from "@yorozu/animations"
import {
    computeStageFitRectFromElement,
    createMediaGhost,
    MEDIA_GHOST_CLOSE_EASING,
    MEDIA_GHOST_CLOSE_MS,
    MEDIA_GHOST_EASING,
    MEDIA_GHOST_MS,
} from "../ghost"
import { captureOriginFromDom, isMediaOriginLandable, queryMediaOriginEl } from "../origin"
import type { MediaViewer, MediaViewerSnapshot } from "../types"
import { viewportFallback } from "./css"

export type AttachGhostFlight = {
    runOpenGhost: (hooks: { onLand: () => void | Promise<void> }) => Promise<boolean>
    runCloseGhost: () => Promise<boolean>
    cancel: () => void
    uncover: () => void
}

export function createGhostFlight(opts: {
    getOverlay: () => HTMLElement | null
    getViewport: () => HTMLElement | null
    getGhostHost: () => HTMLElement
    getHistoryClipRoot: () => HTMLElement | null
    viewer: MediaViewer
    isDetached: () => boolean
    applyOverlayAttrs: () => void
}): AttachGhostFlight {
    let ghost = createMediaGhost()
    let originCover: { el: HTMLElement; prev: string } | null = null

    function paintedStageEl(): HTMLElement | null {
        let overlay = opts.getOverlay()
        let viewport = opts.getViewport()
        if (!overlay) return viewport
        let zoomEl = overlay.querySelector("[data-yorozu-media-zoom]")
        if (zoomEl instanceof HTMLElement) return zoomEl
        let active = overlay.querySelector('[data-side="active"]')
        if (active instanceof HTMLElement) return active
        return viewport
    }

    function ghostBitmap(): CanvasImageSource | undefined {
        let overlay = opts.getOverlay()
        let viewport = opts.getViewport()
        let scope = overlay ?? viewport
        if (!scope) return undefined
        let active = scope.querySelector('[data-side="active"]')
        if (!(active instanceof HTMLElement)) return undefined
        let stage = active.querySelector("[data-yorozu-media-stage]")
        if (stage instanceof HTMLImageElement || stage instanceof HTMLCanvasElement) return stage
        let peek = active.querySelector("[data-yorozu-media-peek]")
        if (peek instanceof HTMLImageElement || peek instanceof HTMLCanvasElement) return peek
        return undefined
    }

    function naturalForFit(snap: MediaViewerSnapshot): { width: number; height: number } {
        let current = snap.current
        let seed = snap.origin
        let width = current?.naturalWidth || seed?.naturalWidth || 0
        let height = current?.naturalHeight || seed?.naturalHeight || 0
        let viewport = opts.getViewport()
        let stageEl = viewport?.querySelector("[data-side=active] [data-yorozu-media-stage]")
        if (stageEl instanceof HTMLImageElement) {
            if (stageEl.naturalWidth > 0) width = stageEl.naturalWidth
            if (stageEl.naturalHeight > 0) height = stageEl.naturalHeight
        } else if (stageEl instanceof HTMLCanvasElement) {
            if (stageEl.width > 0) width = stageEl.width
            if (stageEl.height > 0) height = stageEl.height
        } else if (stageEl instanceof HTMLVideoElement) {
            if (stageEl.videoWidth > 0) width = stageEl.videoWidth
            if (stageEl.videoHeight > 0) height = stageEl.videoHeight
        } else {
            let imgEl = viewport?.querySelector("[data-side=active] img")
            if (imgEl instanceof HTMLImageElement) {
                if (imgEl.naturalWidth > 0) width = imgEl.naturalWidth
                if (imgEl.naturalHeight > 0) height = imgEl.naturalHeight
            }
        }
        return { width: width > 0 ? width : 1, height: height > 0 ? height : 1 }
    }

    function coverOriginEl(el: HTMLElement | null): void {
        if (!el) return
        if (originCover?.el === el) return
        uncoverOriginEl()
        originCover = { el, prev: el.style.visibility }
        el.style.visibility = "hidden"
    }

    function uncoverOriginEl(): void {
        if (!originCover) return
        originCover.el.style.visibility = originCover.prev
        originCover = null
    }

    async function runOpenGhost(hooks: { onLand: () => void | Promise<void> }): Promise<boolean> {
        let snap = opts.viewer.snapshot()
        let seed = snap.origin
        if (!seed) return false
        opts.applyOverlayAttrs()
        await dualRaf()
        let overlay = opts.getOverlay()
        let viewport = opts.getViewport()
        if (opts.isDetached() || !viewport || !overlay) return false
        opts.applyOverlayAttrs()
        let stage = paintedStageEl() ?? viewport
        let to = computeStageFitRectFromElement(stage, naturalForFit(snap))
        let handle = ghost.playOpen({
            host: opts.getGhostHost(),
            seed,
            to,
            hideTarget: viewport,
            bitmap: ghostBitmap(),
            durationMs: MEDIA_GHOST_MS,
            easing: MEDIA_GHOST_EASING,
            onLand: async () => {
                await hooks.onLand()
                opts.applyOverlayAttrs()
            },
        })
        if (!handle) return false
        coverOriginEl(queryMediaOriginEl(seed.id))
        let ran = await handle.done
        opts.applyOverlayAttrs()
        return ran
    }

    async function runCloseGhost(): Promise<boolean> {
        opts.applyOverlayAttrs()
        let snap = opts.viewer.snapshot()
        let current = snap.current
        let live = current ? captureOriginFromDom(current.id) : null
        let viewport = opts.getViewport()
        let stage = paintedStageEl() ?? viewport
        let fromStage = stage ? computeStageFitRectFromElement(stage, naturalForFit(snap)) : null
        if (!fromStage && stage) {
            let box = stage.getBoundingClientRect()
            if (box.width > 0 && box.height > 0) {
                fromStage = { top: box.top, left: box.left, width: box.width, height: box.height }
            }
        }
        if (!fromStage) {
            let fb = viewportFallback()
            fromStage = { top: 0, left: 0, width: fb.width, height: fb.height }
        }
        let fb = viewportFallback()
        let viewportRect = { top: 0, left: 0, width: fb.width, height: fb.height }
        let clipEl = opts.getHistoryClipRoot()
        let clip: { top: number; left: number; width: number; height: number } | null = null
        if (clipEl) {
            let box = clipEl.getBoundingClientRect()
            clip = { top: box.top, left: box.left, width: box.width, height: box.height }
        }
        let landable = live != null && isMediaOriginLandable(live.rect, { viewport: viewportRect, clip })
        let handle = ghost.playClose({
            host: opts.getGhostHost(),
            fromStage,
            target: landable ? live : null,
            imageUrl: current?.src ?? live?.imageUrl ?? null,
            bitmap: ghostBitmap(),
            durationMs: MEDIA_GHOST_CLOSE_MS,
            easing: MEDIA_GHOST_CLOSE_EASING,
            onLand: uncoverOriginEl,
        })
        if (!handle) return false
        let ran = await handle.done
        opts.applyOverlayAttrs()
        return ran
    }

    function cancel(): void {
        ghost.cancel()
    }

    return {
        runOpenGhost,
        runCloseGhost,
        cancel,
        uncover: uncoverOriginEl,
    }
}
