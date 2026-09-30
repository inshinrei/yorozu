/**
 * Overlay + stage + optional filmstrip + chrome slots. Host paints chrome; this module owns gestures and ghost flight.
 */
import { dualRaf, prefersReducedMotion } from "@yorozu/animations"
import { createMediaDecodePort } from "../decode"
import {
    computeStageFitRectFromElement,
    createMediaGhost,
    MEDIA_GHOST_CLOSE_EASING,
    MEDIA_GHOST_CLOSE_MS,
    MEDIA_GHOST_EASING,
    MEDIA_GHOST_MS,
    type MediaGhost,
} from "../ghost"
import { bindMediaViewerKeys } from "../keyboard"
import { fitContain, stageContentSize } from "../layout"
import { captureOriginFromDom, isMediaOriginLandable, queryMediaOriginEl } from "../origin"
import { createMediaShell, type MediaShell } from "../shell"
import { createMediaSwipe, type MediaSwipe } from "../swipe-controller"
import { MEDIA_SWIPE_WHEEL_COOLDOWN_MS } from "../swipe"
import type {
    MediaViewer,
    MediaViewerChrome,
    MediaViewerChromeApi,
    MediaViewerNavFrom,
    MediaViewerOpenOpts,
    MediaViewerSnapshot,
    MediaVisibleIds,
} from "../types"
import { MEDIA_WHEEL_ZOOM_RELEASE_MS, wheelIntent, wheelPanDeltas, type MediaPoint } from "../zoom"
import { createMediaImageZoom, type MediaImageZoom } from "../zoom-controller"
import { isZoomable, readPadding, TAP_MOVE_PX, viewportFallback } from "./css"
import { createFilmstripDom } from "./filmstrip-dom"
import { createPanes } from "./panes"

export type AttachMediaViewerOpts = {
    getGhostHost?: () => HTMLElement | null
    getHistoryClipRoot?: () => HTMLElement | null
    prefersReducedMotion?: () => boolean
    ariaLabel?: string
}

type SlotName = "header" | "footer" | "overlay"

export function attachMediaViewer(viewer: MediaViewer, root: HTMLElement, opts?: AttachMediaViewerOpts): () => void {
    root.setAttribute("data-yorozu-media-root", "")

    let detached = false
    let painting = false
    let paintQueued = false
    let startedOpen = false
    let lastContentId: string | null = null
    let rafId: number | null = null
    let abort: AbortController | null = null
    let scrollLockLinger: AbortController | null = null
    let scrollLockLingerTimer: ReturnType<typeof setTimeout> | null = null
    let resizeObserver: ResizeObserver | null = null
    let unbindKeys: (() => void) | null = null

    let overlay: HTMLElement | null = null
    let originCover: { el: HTMLElement; prev: string } | null = null
    let viewport: HTMLElement | null = null
    let strip: HTMLElement | null = null
    let header: HTMLElement | null = null
    let footer: HTMLElement | null = null
    let chromeEl: HTMLElement | null = null
    let backdrop: HTMLElement | null = null
    let shell: MediaShell | null = null

    let mounted: { header?: MediaViewerChrome; footer?: MediaViewerChrome; overlay?: MediaViewerChrome } = {}
    let unmounts: { header?: () => void; footer?: () => void; overlay?: () => void } = {}
    // Zoom lives for attach; chrome remounts each open. Track overlay-scoped unsubs.
    let chromeZoomUnsubs: (() => void)[] = []
    let decodePort = createMediaDecodePort({ budget: viewer.decodeBudget() })

    let panes = createPanes({
        getStrip: (): HTMLElement | null => strip,
        viewer,
        decodePort,
        isDetached: (): boolean => detached,
        reducedMotion,
        measureZoom,
    })

    let tapPointerId: number | null = null
    let tapX = 0
    let tapY = 0
    let tapMoved = false
    let zoomDragging = false
    let dragOriginX = 0
    let dragOriginY = 0
    let dragStartX = 0
    let dragStartY = 0
    let pointers = new Map<number, { x: number; y: number }>()
    let pinching = false
    let pinchDist = 0
    let pinchOrigin: MediaPoint | null = null
    let wheelZoomReleaseTimer: ReturnType<typeof setTimeout> | null = null
    let lastWheelZoomOrigin: MediaPoint | null = null
    let openSeq = 0
    let paintedOpenSeq = -1
    let innerOpen = viewer.open
    viewer.open = (openOpts: MediaViewerOpenOpts): void => {
        openSeq += 1
        innerOpen(openOpts)
    }

    function reducedMotion(): boolean {
        return (opts?.prefersReducedMotion ?? prefersReducedMotion)()
    }

    function ghostHost(): HTMLElement {
        return opts?.getGhostHost?.() ?? document.body
    }

    let ghost: MediaGhost = createMediaGhost()
    let zoom: MediaImageZoom = createMediaImageZoom({ prefersReducedMotion: reducedMotion })
    zoom.onChange(() => scheduleRender())
    let swipe: MediaSwipe = createMediaSwipe({
        getEnabled: (): boolean => {
            if (!overlay || !viewer.snapshot().open) return false
            if (shell && shell.openPhase() !== "open") return false
            let current = viewer.snapshot().current
            if (isZoomable(current) && zoom.isZoomed()) return false
            return true
        },
        getCanOlder: (): boolean => viewer.snapshot().canOlder,
        getCanNewer: (): boolean => viewer.snapshot().canNewer,
        getPrefersReducedMotion: reducedMotion,
        getViewport: (): { width: number; height: number } => {
            if (viewport) {
                let box = viewport.getBoundingClientRect()
                let width = box.width || viewport.clientWidth
                let height = box.height || viewport.clientHeight
                if (width > 0 && height > 0) return { width, height }
            }
            return viewportFallback()
        },
        onOlder: (): void => {
            viewer.prev("swipe")
        },
        onNewer: (): void => {
            viewer.next("swipe")
        },
        onClose: (): void => {
            requestViewerClose()
        },
        willRebaseNav: (dir: "older" | "newer"): boolean => {
            let snap = viewer.snapshot()
            if (dir === "older") return snap.index > 0
            return snap.index < snap.items.length - 1
        },
        onGestureChange: (): void => {
            syncSwipeGesturing()
        },
        onSettle: (): void => {
            afterSwipeSettle()
        },
    })

    let filmstrip = createFilmstripDom({
        getOverlay: (): HTMLElement | null => overlay,
        getViewport: (): HTMLElement | null => viewport,
        getAbortSignal: (): AbortSignal | null => abort?.signal ?? null,
        viewer,
        swipe,
        decodePort,
        isDetached: (): boolean => detached,
        reducedMotion,
        emitVisible,
        openPhase: (): "opening" | "open" | "closing" | null => shell?.openPhase() ?? null,
    })

    function cancelRaf(): void {
        if (rafId == null) return
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId)
        rafId = null
    }

    function needsLiveRender(): boolean {
        return swipe.gesturing() || swipe.settling() || swipe.dismissing()
    }

    function clearWheelZoomRelease(): void {
        if (wheelZoomReleaseTimer == null) return
        clearTimeout(wheelZoomReleaseTimer)
        wheelZoomReleaseTimer = null
    }

    function armWheelZoomRelease(origin: MediaPoint): void {
        lastWheelZoomOrigin = origin
        clearWheelZoomRelease()
        wheelZoomReleaseTimer = setTimeout(() => {
            wheelZoomReleaseTimer = null
            zoom.endDrag({ withInertia: false, pinchOrigin: lastWheelZoomOrigin })
            scheduleRender()
        }, MEDIA_WHEEL_ZOOM_RELEASE_MS)
    }

    function scheduleRender(): void {
        if (detached || overlay == null) return
        if (rafId != null) return
        const frame = (cb: FrameRequestCallback): number => {
            if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb)
            return setTimeout(() => cb(0), 0) as unknown as number
        }
        rafId = frame(() => {
            rafId = null
            applyOverlayAttrs()
            if (viewer.snapshot().filmstrip) {
                filmstrip.withMetrics(() => {
                    filmstrip.stampGeometry(viewer.snapshot())
                })
            }
            if (needsLiveRender()) scheduleRender()
        })
    }

    function pointFromEvent(e: { clientX: number; clientY: number }): MediaPoint {
        let el = (overlay?.querySelector("[data-yorozu-media-zoom]") as HTMLElement | null) ?? viewport
        if (!el) return { offsetX: 0, offsetY: 0 }
        let box = el.getBoundingClientRect()
        return {
            offsetX: e.clientX - (box.left + box.width / 2),
            offsetY: e.clientY - (box.top + box.height / 2),
        }
    }

    function paintedStageEl(): HTMLElement | null {
        if (!overlay) return viewport
        let zoomEl = overlay.querySelector("[data-yorozu-media-zoom]")
        if (zoomEl instanceof HTMLElement) return zoomEl
        let active = overlay.querySelector('[data-side="active"]')
        if (active instanceof HTMLElement) return active
        return viewport
    }

    function ghostBitmap(): CanvasImageSource | undefined {
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

    function measureStageEl(): HTMLElement | null {
        if (!overlay) return viewport
        let zoomEl = overlay.querySelector("[data-yorozu-media-zoom]")
        if (zoomEl instanceof HTMLElement) return zoomEl
        let active = overlay.querySelector('[data-side="active"]')
        if (active instanceof HTMLElement) return active
        return viewport
    }

    function measureZoom(): void {
        if (detached || !viewport) return
        let current = viewer.snapshot().current
        let stage = measureStageEl() ?? viewport
        let fallback = viewportFallback()
        let vw = stage.clientWidth || fallback.width
        let vh = stage.clientHeight || fallback.height
        let content = stageContentSize(vw, vh, readPadding(stage))
        zoom.setViewportSize(content.width, content.height)
        let nw = current?.naturalWidth || 0
        let nh = current?.naturalHeight || 0
        let stageImg = viewport.querySelector("[data-side=active] [data-yorozu-media-stage]")
        if (stageImg instanceof HTMLImageElement) {
            if (stageImg.naturalWidth > 0) nw = stageImg.naturalWidth
            if (stageImg.naturalHeight > 0) nh = stageImg.naturalHeight
        } else if (stageImg instanceof HTMLCanvasElement) {
            if (stageImg.width > 0) nw = stageImg.width
            if (stageImg.height > 0) nh = stageImg.height
        } else if (stageImg instanceof HTMLVideoElement) {
            if (stageImg.videoWidth > 0) nw = stageImg.videoWidth
            if (stageImg.videoHeight > 0) nh = stageImg.videoHeight
        }
        if (nw > 0 && nh > 0) {
            zoom.setNaturalSize(nw, nh)
            let fit = fitContain({ width: nw, height: nh }, content)
            if (fit) zoom.setLayoutSize(fit.width, fit.height)
            else zoom.setLayoutSize(content.width, content.height)
        } else {
            zoom.setLayoutSize(content.width, content.height)
        }
        scheduleRender()
    }

    function applyOverlayAttrs(): void {
        if (!overlay) return
        let phase = shell?.openPhase() ?? "open"
        overlay.setAttribute("data-phase", phase)
        if (shell?.scrimSolid()) overlay.setAttribute("data-scrim", "")
        else overlay.removeAttribute("data-scrim")
        let hidden = shell != null && !shell.mediaRevealed() && phase !== "closing"
        if (hidden) overlay.setAttribute("data-media-hidden", "")
        else overlay.removeAttribute("data-media-hidden")
        let dismiss = swipe.dismissing() || swipe.offsetY() > 0
        if (dismiss) overlay.setAttribute("data-swipe-dismiss", "")
        else overlay.removeAttribute("data-swipe-dismiss")
        overlay.style.setProperty("--yorozu-media-dismiss-alpha", String(swipe.dismissOpacity()))
        overlay.style.setProperty("--yorozu-media-filmstrip-max-width", viewer.snapshot().filmstripMaxWidth)
        if (strip) {
            let next = swipe.transformStyle()
            strip.style.transform = next ?? ""
            let dir = shell?.switchDir() ?? "none"
            let key = String(shell?.switchAnimKey() ?? 0)
            if (dir === "none") {
                strip.removeAttribute("data-switch")
                strip.removeAttribute("data-switch-key")
            } else if (strip.getAttribute("data-switch") !== dir || strip.getAttribute("data-switch-key") !== key) {
                strip.removeAttribute("data-switch")
                void strip.offsetWidth
                strip.setAttribute("data-switch-key", key)
                strip.setAttribute("data-switch", dir)
            }
        }
        let zoomEl = overlay.querySelector("[data-yorozu-media-zoom]") as HTMLElement | null
        if (zoomEl) zoomEl.style.transform = zoom.transformStyle()
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
        let snap = viewer.snapshot()
        let seed = snap.origin
        if (!seed) return false
        applyOverlayAttrs()
        await dualRaf()
        if (detached || !viewport || !overlay) return false
        applyOverlayAttrs()
        let stage = paintedStageEl() ?? viewport
        let to = computeStageFitRectFromElement(stage, naturalForFit(snap))
        let handle = ghost.playOpen({
            host: ghostHost(),
            seed,
            to,
            hideTarget: viewport,
            bitmap: ghostBitmap(),
            durationMs: MEDIA_GHOST_MS,
            easing: MEDIA_GHOST_EASING,
            onLand: async () => {
                await hooks.onLand()
                applyOverlayAttrs()
            },
        })
        if (!handle) return false
        coverOriginEl(queryMediaOriginEl(seed.id))
        let ran = await handle.done
        applyOverlayAttrs()
        return ran
    }

    async function runCloseGhost(): Promise<boolean> {
        applyOverlayAttrs()
        let snap = viewer.snapshot()
        let current = snap.current
        let live = current ? captureOriginFromDom(current.id) : null
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
        let clipEl = opts?.getHistoryClipRoot?.()
        let clip: { top: number; left: number; width: number; height: number } | null = null
        if (clipEl) {
            let box = clipEl.getBoundingClientRect()
            clip = { top: box.top, left: box.left, width: box.width, height: box.height }
        }
        let landable = live != null && isMediaOriginLandable(live.rect, { viewport: viewportRect, clip })
        let handle = ghost.playClose({
            host: ghostHost(),
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
        applyOverlayAttrs()
        return ran
    }

    function ensureShell(): void {
        if (shell) return
        shell = createMediaShell({
            skipGhost: (): boolean => reducedMotion() || !viewer.wantsGhost("open"),
            hasOpenOrigin: (): boolean => viewer.snapshot().origin != null,
            getOpenPinnedUrl: (): string | null =>
                viewer.snapshot().origin?.imageUrl ?? viewer.snapshot().current?.src ?? null,
            runOpenGhost,
            runCloseGhost,
            cancelGhost: (): void => {
                ghost.cancel()
            },
            onFinishClose: (): void => {
                if (viewer.snapshot().open) viewer.close()
            },
            lastNav: (): MediaViewerNavFrom | null => viewer.lastNav(),
        })
    }

    function clearScrollLockLinger(): void {
        if (scrollLockLingerTimer != null) {
            clearTimeout(scrollLockLingerTimer)
            scrollLockLingerTimer = null
        }
        scrollLockLinger?.abort()
        scrollLockLinger = null
    }

    function startScrollLockLingerTimer(): void {
        if (scrollLockLingerTimer != null) clearTimeout(scrollLockLingerTimer)
        scrollLockLingerTimer = setTimeout(() => {
            scrollLockLingerTimer = null
            clearScrollLockLinger()
        }, MEDIA_SWIPE_WHEEL_COOLDOWN_MS)
    }

    function armScrollLockLinger(): void {
        clearScrollLockLinger()
        scrollLockLinger = new AbortController()
        let signal = scrollLockLinger.signal
        const onLingerScroll = (e: Event): void => {
            e.preventDefault()
        }
        window.addEventListener("wheel", onLingerScroll, { capture: true, passive: false, signal })
        window.addEventListener("touchmove", onLingerScroll, { capture: true, passive: false, signal })
        startScrollLockLingerTimer()
    }

    function requestViewerClose(closeOpts?: { ghost?: boolean }): void {
        if (!viewer.snapshot().open) return
        if (!swipe.dismissing()) clearScrollLockLinger()
        let wants = viewer.beginClose(closeOpts)
        applyOverlayAttrs()
        if (!wants) {
            ghost.cancel()
            tearDownOverlay()
            viewer.close()
            return
        }
        if (shell) {
            void shell.requestClose()
            return
        }
        tearDownOverlay()
        viewer.close()
    }

    function forceViewerClose(): void {
        clearScrollLockLinger()
        ghost.cancel()
        tearDownOverlay({ linger: false })
        clearScrollLockLinger()
        if (viewer.snapshot().open) viewer.forceClose()
    }

    let api: MediaViewerChromeApi = {
        close: (closeOpts?: { ghost?: boolean }): void => {
            requestViewerClose(closeOpts)
        },
        forceClose: (): void => {
            forceViewerClose()
        },
        prev: (): void => {
            viewer.prev("prev")
        },
        next: (): void => {
            viewer.next("next")
        },
        goTo: (index: number): void => {
            viewer.goTo(index)
        },
        zoomIn: (): void => {
            if (!isZoomable(viewer.snapshot().current)) return
            zoom.zoomIn()
            scheduleRender()
        },
        zoomOut: (): void => {
            if (!isZoomable(viewer.snapshot().current)) return
            zoom.zoomOut()
            scheduleRender()
        },
        resetZoom: (): void => {
            if (!isZoomable(viewer.snapshot().current)) return
            zoom.reset()
            scheduleRender()
        },
        percentLabel: (): string => zoom.percentLabel(),
        scale: (): number => zoom.scale(),
        onZoomChange: (listener: () => void): (() => void) => {
            let unsub = zoom.onChange(listener)
            chromeZoomUnsubs.push(unsub)
            return (): void => {
                unsub()
                let i = chromeZoomUnsubs.indexOf(unsub)
                if (i >= 0) chromeZoomUnsubs.splice(i, 1)
            }
        },
        isGesturing: (): boolean => viewer.isGesturing(),
        snapshot: (): MediaViewerSnapshot => viewer.snapshot(),
    }

    function bindKeys(): void {
        if (unbindKeys) return
        unbindKeys = bindMediaViewerKeys({
            close: (): void => {
                requestViewerClose()
            },
            prev: (): void => {
                viewer.prev("prev")
            },
            next: (): void => {
                viewer.next("next")
            },
            zoomIn: (): void => {
                api.zoomIn()
            },
            zoomOut: (): void => {
                api.zoomOut()
            },
            resetZoom: (): void => {
                api.resetZoom()
            },
            getAllowSwitch: (): boolean => {
                if (!viewer.snapshot().open) return false
                if (shell && shell.openPhase() !== "open") return false
                let current = viewer.snapshot().current
                if (isZoomable(current) && zoom.isZoomed()) return false
                return true
            },
            getAllowZoom: (): boolean => isZoomable(viewer.snapshot().current),
        })
    }

    function slotEl(name: SlotName): HTMLElement | null {
        if (name === "header") return header
        if (name === "footer") return footer
        return chromeEl
    }

    function syncSlot(name: SlotName, fn: MediaViewerChrome | undefined): void {
        let el = slotEl(name)
        if (!el) return
        if (mounted[name] === fn) return
        unmounts[name]?.()
        unmounts[name] = undefined
        el.replaceChildren()
        mounted[name] = fn
        if (!fn) return
        let cleanup = fn(el, api)
        if (typeof cleanup === "function") unmounts[name] = cleanup
    }

    function flushChromeZoomUnsubs(): void {
        let pending = chromeZoomUnsubs
        chromeZoomUnsubs = []
        for (let unsub of pending) unsub()
    }

    function unmountAllChrome(): void {
        flushChromeZoomUnsubs()
        syncSlot("header", undefined)
        syncSlot("footer", undefined)
        syncSlot("overlay", undefined)
        mounted = {}
        unmounts = {}
    }

    function syncChrome(): void {
        let slots = viewer.chrome()
        syncSlot("header", slots?.header)
        syncSlot("footer", slots?.footer)
        syncSlot("overlay", slots?.overlay)
    }

    function syncSwipeGesturing(): void {
        let on = swipe.gesturing() || swipe.settling() || swipe.dismissing()
        viewer.setGesturing(on)
        if (on) {
            decodePort.pausePeeksAndThumbs()
            return
        }
        decodePort.resume()
    }

    function afterSwipeSettle(): void {
        syncSwipeGesturing()
        if (detached || overlay == null || abort == null) return
        if (viewer.isGesturing()) return
        if (viewer.decodeFn()) {
            let snap = viewer.snapshot()
            panes.paintPanes(snap)
            filmstrip.refreshThumbsAfterSettle()
        }
        emitVisible()
    }

    function visibleIds(): MediaVisibleIds {
        let snap = viewer.snapshot()
        let peeks: string[] = []
        if (snap.neighbors.older) peeks.push(snap.neighbors.older.id)
        if (snap.neighbors.newer) peeks.push(snap.neighbors.newer.id)
        return {
            stage: snap.current?.id ?? "",
            peeks,
            thumbs: filmstrip.paintedThumbIds(snap),
        }
    }

    function emitVisible(): void {
        if (detached || overlay == null) return
        viewer.notifyVisible(visibleIds())
    }

    function pinchDistance(): number {
        if (pointers.size < 2) return 0
        let pts = [...pointers.values()]
        return Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y)
    }

    function pinchMidpoint(): MediaPoint {
        let pts = [...pointers.values()]
        if (pts.length < 2) return { offsetX: 0, offsetY: 0 }
        return pointFromEvent({
            clientX: (pts[0]!.x + pts[1]!.x) / 2,
            clientY: (pts[0]!.y + pts[1]!.y) / 2,
        })
    }

    function startPinch(): void {
        if (!isZoomable(viewer.snapshot().current)) return
        pinching = true
        tapMoved = true
        if (zoomDragging) {
            zoomDragging = false
            zoom.endDrag({ withInertia: false })
        }
        swipe.reset()
        pinchDist = pinchDistance()
        pinchOrigin = pinchMidpoint()
        zoom.beginDrag()
    }

    function endPinch(): void {
        if (!pinching) return
        pinching = false
        zoomDragging = false
        zoom.endDrag({ pinchOrigin, withInertia: false })
        pinchOrigin = null
        pinchDist = 0
    }

    function onViewportPointerDown(e: PointerEvent): void {
        let t = e.target
        if (!(t instanceof Element && t.closest("button, a, input, textarea, select, video"))) {
            try {
                viewport?.setPointerCapture(e.pointerId)
            } catch {
                // optional
            }
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (isZoomable(viewer.snapshot().current) && pointers.size >= 2) {
            if (!pinching) startPinch()
            scheduleRender()
            return
        }
        tapPointerId = e.pointerId
        tapX = e.clientX
        tapY = e.clientY
        tapMoved = false
        dragOriginX = e.clientX
        dragOriginY = e.clientY
        if (swipe.onPointerDown(e)) {
            zoomDragging = false
            scheduleRender()
            return
        }
        scheduleRender()
    }

    function onViewportPointerMove(e: PointerEvent): void {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pinching && pointers.size >= 2) {
            e.preventDefault()
            let dist = pinchDistance()
            if (pinchDist > 0 && dist > 0) {
                let amount = dist / pinchDist - 1
                pinchOrigin = pinchMidpoint()
                zoom.applyRelativeZoomSoft(amount, pinchOrigin)
                pinchDist = dist
            }
            scheduleRender()
            return
        }
        if (tapPointerId === e.pointerId) {
            if (Math.hypot(e.clientX - tapX, e.clientY - tapY) > TAP_MOVE_PX) {
                tapMoved = true
                if (!zoomDragging && !pinching && isZoomable(viewer.snapshot().current) && zoom.isZoomed()) {
                    zoom.beginDrag()
                    zoomDragging = true
                    let start = zoom.getDragStartTranslate()
                    dragStartX = start.translateX
                    dragStartY = start.translateY
                    try {
                        viewport?.setPointerCapture(e.pointerId)
                    } catch {
                        // optional
                    }
                }
            }
        }
        if (zoomDragging) {
            e.preventDefault()
            zoom.moveDrag(e.clientX - dragOriginX, e.clientY - dragOriginY, dragStartX, dragStartY)
            scheduleRender()
            return
        }
        swipe.onPointerMove(e)
        scheduleRender()
    }

    function onViewportPointerUp(e: PointerEvent): void {
        pointers.delete(e.pointerId)
        if (pinching) {
            if (pointers.size < 2) endPinch()
            if (tapPointerId === e.pointerId) tapPointerId = null
            scheduleRender()
            return
        }
        if (zoomDragging) {
            zoomDragging = false
            zoom.endDrag()
            if (tapPointerId === e.pointerId) tapPointerId = null
            scheduleRender()
            return
        }
        swipe.onPointerUp(e)
        if (tapPointerId === e.pointerId) {
            tapPointerId = null
        }
        scheduleRender()
    }

    function onViewportPointerCancel(e: PointerEvent): void {
        pointers.delete(e.pointerId)
        if (pinching) {
            if (pointers.size < 2) endPinch()
            if (tapPointerId === e.pointerId) tapPointerId = null
            scheduleRender()
            return
        }
        if (zoomDragging) {
            zoomDragging = false
            zoom.endDrag({ withInertia: false })
        }
        swipe.onPointerCancel(e)
        if (tapPointerId === e.pointerId) tapPointerId = null
        scheduleRender()
    }

    function onViewportWheel(e: WheelEvent): void {
        if (isZoomable(viewer.snapshot().current)) {
            let intent = wheelIntent(zoom.isZoomed(), e.ctrlKey || e.metaKey)
            if (intent === "zoom") {
                e.preventDefault()
                e.stopPropagation()
                let origin = pointFromEvent(e)
                zoom.applyWheel(e.deltaY, origin)
                armWheelZoomRelease(origin)
                scheduleRender()
                return
            }
            if (intent === "pan") {
                e.preventDefault()
                e.stopPropagation()
                let pan = wheelPanDeltas(e.deltaX, e.deltaY, e.deltaMode)
                zoom.panBy(-pan.deltaX, -pan.deltaY)
                scheduleRender()
                return
            }
        }
        swipe.trapWheel(e)
        scheduleRender()
    }

    function createOverlay(): void {
        clearScrollLockLinger()
        abort = new AbortController()
        let signal = abort.signal
        overlay = document.createElement("div")
        overlay.setAttribute("data-yorozu-media-viewer", "")
        overlay.setAttribute("role", "dialog")
        overlay.setAttribute("aria-modal", "true")
        overlay.setAttribute("aria-label", opts?.ariaLabel ?? "Media viewer")
        overlay.tabIndex = -1

        viewport = document.createElement("div")
        viewport.setAttribute("data-yorozu-media-viewport", "")
        strip = document.createElement("div")
        strip.setAttribute("data-yorozu-media-strip", "")
        strip.style.setProperty("--yorozu-media-slide-gap", "40px")
        viewport.append(strip)

        backdrop = document.createElement("div")
        backdrop.setAttribute("data-yorozu-media-backdrop", "")
        header = document.createElement("div")
        header.setAttribute("data-yorozu-media-header", "")
        footer = document.createElement("div")
        footer.setAttribute("data-yorozu-media-footer", "")
        chromeEl = document.createElement("div")
        chromeEl.setAttribute("data-yorozu-media-chrome", "")

        overlay.append(backdrop, viewport, header, footer, chromeEl)
        root.append(overlay)

        let filmstripTouchX: number | null = null
        let filmstripTouchY: number | null = null
        const clearFilmstripTouchSample = (): void => {
            filmstripTouchX = null
            filmstripTouchY = null
        }
        const lockPageScroll = (e: Event): void => {
            let t = e.target
            // Window/document are not Elements (jsdom also breaks `currentTarget === window`).
            if (!(e.currentTarget instanceof Element)) {
                if (overlay != null && t instanceof Node && overlay.contains(t)) return
                e.preventDefault()
                e.stopPropagation()
                return
            }
            if (t instanceof Element && t.closest("[data-yorozu-media-filmstrip]")) {
                e.stopPropagation()
                if (!isFilmstripPanX(e)) e.preventDefault()
                return
            }
            clearFilmstripTouchSample()
            if (
                t instanceof Element &&
                t.closest("[data-yorozu-media-header], [data-yorozu-media-footer], [data-yorozu-media-chrome]")
            ) {
                e.stopPropagation()
                return
            }
            e.preventDefault()
            e.stopPropagation()
        }

        function isFilmstripPanX(e: Event): boolean {
            if (e instanceof WheelEvent) return Math.abs(e.deltaX) > Math.abs(e.deltaY)
            if (!(e instanceof TouchEvent)) return false
            let touch = e.touches[0] ?? e.changedTouches[0]
            if (!touch) return false
            let x = touch.clientX
            let y = touch.clientY
            if (filmstripTouchX == null || filmstripTouchY == null) {
                filmstripTouchX = x
                filmstripTouchY = y
                return false
            }
            let panX = Math.abs(x - filmstripTouchX) > Math.abs(y - filmstripTouchY)
            filmstripTouchX = x
            filmstripTouchY = y
            return panX
        }
        overlay.addEventListener("wheel", lockPageScroll, { passive: false, signal })
        overlay.addEventListener("touchmove", lockPageScroll, { passive: false, signal })
        window.addEventListener("wheel", lockPageScroll, { capture: true, passive: false, signal })
        window.addEventListener("touchmove", lockPageScroll, { capture: true, passive: false, signal })
        overlay.addEventListener("touchend", clearFilmstripTouchSample, { signal })
        overlay.addEventListener("touchcancel", clearFilmstripTouchSample, { signal })
        overlay.addEventListener("pointerup", clearFilmstripTouchSample, { signal })
        overlay.addEventListener("pointercancel", clearFilmstripTouchSample, { signal })

        viewport.addEventListener("pointerdown", onViewportPointerDown, { signal })
        viewport.addEventListener("pointermove", onViewportPointerMove, { signal, passive: false })
        viewport.addEventListener("pointerup", onViewportPointerUp, { signal })
        viewport.addEventListener("pointercancel", onViewportPointerCancel, { signal })
        viewport.addEventListener("wheel", onViewportWheel, { signal, passive: false })

        if (typeof ResizeObserver === "function") {
            resizeObserver = new ResizeObserver(() => measureZoom())
            resizeObserver.observe(viewport)
        }
        startedOpen = false
    }

    function tearDownOverlay(opts?: { linger?: boolean }): void {
        let shouldLinger = opts?.linger !== false && swipe.dismissing()
        unbindKeys?.()
        unbindKeys = null
        unmountAllChrome()
        resizeObserver?.disconnect()
        resizeObserver = null
        filmstrip.destroy()
        abort?.abort()
        abort = null
        cancelRaf()
        clearWheelZoomRelease()
        lastWheelZoomOrigin = null
        ghost.cancel()
        uncoverOriginEl()
        swipe.reset()
        viewer.setGesturing(false)
        zoom.reset()
        zoomDragging = false
        tapPointerId = null
        pointers.clear()
        pinching = false
        pinchOrigin = null
        pinchDist = 0
        lastContentId = null
        startedOpen = false
        panes.reset()
        if (viewer.decodeFn()) decodePort.abortExcept([])
        let currentShell = shell
        shell = null
        currentShell?.destroy()
        if (overlay != null) {
            viewer.notifyVisible({ stage: "", peeks: [], thumbs: [] })
        }
        overlay?.remove()
        overlay = null
        // zoom.reset may have scheduled a frame while overlay was still set.
        cancelRaf()
        viewport = null
        strip = null
        header = null
        footer = null
        chromeEl = null
        backdrop = null
        if (shouldLinger) armScrollLockLinger()
    }

    function paintOpen(): void {
        let snap = viewer.snapshot()
        if (!snap.open) {
            tearDownOverlay()
            paintedOpenSeq = -1
            return
        }
        let isFreshOpen = overlay == null || openSeq !== paintedOpenSeq
        if (isFreshOpen && overlay != null) tearDownOverlay()
        let created = overlay == null
        if (created) createOverlay()
        paintedOpenSeq = openSeq
        ensureShell()
        panes.paintPanes(snap)
        if (snap.current?.id !== lastContentId) {
            clearWheelZoomRelease()
            zoom.reset()
            lastContentId = snap.current?.id ?? null
        }
        if (shell && snap.current) {
            let nav = viewer.lastNav()
            if (nav) shell.markNav(nav)
            shell.trackContentKey(`${snap.index}:${snap.current.id}`)
        }
        syncChrome()
        filmstrip.paint(snap)
        if (!overlay) return
        bindKeys()
        if (created) {
            overlay.setAttribute("data-phase", "opening")
            overlay.removeAttribute("data-scrim")
            void overlay.offsetWidth
        }
        applyOverlayAttrs()
        measureZoom()
        if (created && !startedOpen) {
            startedOpen = true
            void shell?.startOpen().then(() => {
                if (detached) return
                applyOverlayAttrs()
                if (filmstrip.morph(viewer.snapshot()).live) return
                filmstrip.centerCurrent("instant")
            })
            overlay.focus({ preventScroll: true })
        }
        emitVisible()
    }

    function paint(): void {
        if (detached) return
        if (painting) {
            paintQueued = true
            return
        }
        painting = true
        try {
            do {
                paintQueued = false
                paintOpen()
            } while (paintQueued && !detached)
        } finally {
            painting = false
        }
    }

    let unsub = viewer.subscribe(paint)
    paint()

    return (): void => {
        if (detached) return
        detached = true
        viewer.open = innerOpen
        unsub()
        tearDownOverlay()
        clearScrollLockLinger()
        decodePort.destroy()
        swipe.destroy()
        zoom.destroy()
        ghost.cancel()
    }
}
