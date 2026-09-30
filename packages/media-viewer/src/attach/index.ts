/**
 * Overlay + stage + optional filmstrip + chrome slots. Host paints chrome; this module owns gestures and ghost flight.
 */
import { prefersReducedMotion } from "@yorozu/animations"
import { createMediaDecodePort } from "../decode"
import { createMediaShell, type MediaShell } from "../shell"
import { mediaPagerFieldActive } from "../swipe"
import { createMediaSwipe, type MediaSwipe } from "../swipe-controller"
import type { MediaViewer, MediaViewerNavFrom, MediaViewerOpenOpts, MediaVisibleIds } from "../types"
import { createMediaImageZoom, type MediaImageZoom } from "../zoom-controller"
import { createChrome } from "./chrome"
import { isZoomable, viewportFallback } from "./css"
import { createFilmstripDom } from "./filmstrip-dom"
import { createGhostFlight } from "./ghost-flight"
import { createOverlay, type AttachOverlayNodes } from "./overlay"
import { createPanes } from "./panes"
import { createZoomInput, type AttachZoomInput } from "./zoom-input"

export type AttachMediaViewerOpts = {
    getGhostHost?: () => HTMLElement | null
    getHistoryClipRoot?: () => HTMLElement | null
    prefersReducedMotion?: () => boolean
    ariaLabel?: string
}

export function attachMediaViewer(viewer: MediaViewer, root: HTMLElement, opts?: AttachMediaViewerOpts): () => void {
    root.setAttribute("data-yorozu-media-root", "")

    let detached = false
    let painting = false
    let paintQueued = false
    let startedOpen = false
    let lastContentId: string | null = null
    let rafId: number | null = null
    let shell: MediaShell | null = null

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

    let zoom: MediaImageZoom = createMediaImageZoom({ prefersReducedMotion: reducedMotion })
    zoom.onChange(() => scheduleRender())
    let swipe: MediaSwipe = createMediaSwipe({
        getEnabled: (): boolean => {
            if (!overlayNodes() || !viewer.snapshot().open) return false
            if (shell && shell.openPhase() !== "open") return false
            let current = viewer.snapshot().current
            if (isZoomable(current) && zoom.isZoomed()) return false
            return true
        },
        getCanOlder: (): boolean => viewer.snapshot().canOlder,
        getCanNewer: (): boolean => viewer.snapshot().canNewer,
        getPrefersReducedMotion: reducedMotion,
        getViewport: (): { width: number; height: number } => {
            let viewport = overlayNodes()?.viewport
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
    let decodePort = createMediaDecodePort({ budget: viewer.decodeBudget() })

    let zoomInput: AttachZoomInput
    let overlayHandle = createOverlay({
        root,
        ariaLabel: (): string => opts?.ariaLabel ?? "Media viewer",
        measureZoom: (): void => zoomInput.measureZoom(),
    })

    function overlayNodes(): AttachOverlayNodes | null {
        return overlayHandle.nodes()
    }

    zoomInput = createZoomInput({
        getOverlay: (): HTMLElement | null => overlayNodes()?.overlay ?? null,
        getViewport: (): HTMLElement | null => overlayNodes()?.viewport ?? null,
        viewer,
        zoom,
        swipe,
        isDetached: (): boolean => detached,
        scheduleRender,
    })

    let ghostFlight = createGhostFlight({
        getOverlay: (): HTMLElement | null => overlayNodes()?.overlay ?? null,
        getViewport: (): HTMLElement | null => overlayNodes()?.viewport ?? null,
        getGhostHost: ghostHost,
        getHistoryClipRoot: (): HTMLElement | null => opts?.getHistoryClipRoot?.() ?? null,
        viewer,
        isDetached: (): boolean => detached,
        applyOverlayAttrs,
    })

    let panes = createPanes({
        getStrip: (): HTMLElement | null => overlayNodes()?.strip ?? null,
        viewer,
        decodePort,
        isDetached: (): boolean => detached,
        reducedMotion,
        measureZoom: (): void => zoomInput.measureZoom(),
    })

    let filmstrip = createFilmstripDom({
        getOverlay: (): HTMLElement | null => overlayNodes()?.overlay ?? null,
        getViewport: (): HTMLElement | null => overlayNodes()?.viewport ?? null,
        getAbortSignal: (): AbortSignal | null => overlayHandle.abortSignal(),
        viewer,
        swipe,
        decodePort,
        isDetached: (): boolean => detached,
        reducedMotion,
        emitVisible,
        openPhase: (): "opening" | "open" | "closing" | null => shell?.openPhase() ?? null,
    })

    let chrome = createChrome({
        getHeader: (): HTMLElement | null => overlayNodes()?.header ?? null,
        getFooter: (): HTMLElement | null => overlayNodes()?.footer ?? null,
        getChromeEl: (): HTMLElement | null => overlayNodes()?.chromeEl ?? null,
        viewer,
        zoom,
        requestClose: requestViewerClose,
        forceClose: forceViewerClose,
        scheduleRender,
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

    function scheduleRender(): void {
        if (detached || overlayNodes() == null) return
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

    function applyOverlayAttrs(): void {
        let nodes = overlayNodes()
        if (!nodes) return
        let overlay = nodes.overlay
        let strip = nodes.strip
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
        let viewport = nodes.viewport
        if (mediaPagerFieldActive(swipe.offsetX(), swipe.offsetY(), swipe.dismissing())) {
            viewport.setAttribute("data-pager-field", "")
        } else {
            viewport.removeAttribute("data-pager-field")
        }
        overlay.style.setProperty("--yorozu-media-dismiss-alpha", String(swipe.dismissOpacity()))
        overlay.style.setProperty("--yorozu-media-filmstrip-max-width", viewer.snapshot().filmstripMaxWidth)
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
        let zoomEl = overlay.querySelector("[data-yorozu-media-zoom]") as HTMLElement | null
        if (zoomEl) zoomEl.style.transform = zoom.transformStyle()
    }

    function ensureShell(): void {
        if (shell) return
        shell = createMediaShell({
            skipGhost: (): boolean => reducedMotion() || !viewer.wantsGhost("open"),
            hasOpenOrigin: (): boolean => viewer.snapshot().origin != null,
            getOpenPinnedUrl: (): string | null =>
                viewer.snapshot().origin?.imageUrl ?? viewer.snapshot().current?.src ?? null,
            runOpenGhost: ghostFlight.runOpenGhost,
            runCloseGhost: ghostFlight.runCloseGhost,
            cancelGhost: ghostFlight.cancel,
            onFinishClose: (): void => {
                if (viewer.snapshot().open) viewer.close()
            },
            lastNav: (): MediaViewerNavFrom | null => viewer.lastNav(),
        })
    }

    function requestViewerClose(closeOpts?: { ghost?: boolean }): void {
        if (!viewer.snapshot().open) return
        if (!swipe.dismissing()) overlayHandle.clearLinger()
        let wants = viewer.beginClose(closeOpts)
        applyOverlayAttrs()
        if (!wants) {
            ghostFlight.cancel()
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
        overlayHandle.clearLinger()
        ghostFlight.cancel()
        tearDownOverlay({ linger: false })
        overlayHandle.clearLinger()
        if (viewer.snapshot().open) viewer.forceClose()
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
        if (detached || overlayNodes() == null || overlayHandle.abortSignal() == null) return
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
        if (detached || overlayNodes() == null) return
        viewer.notifyVisible(visibleIds())
    }

    function bindZoomInputListeners(nodes: AttachOverlayNodes): void {
        let signal = overlayHandle.abortSignal()!
        nodes.viewport.addEventListener("pointerdown", zoomInput.onPointerDown, { signal })
        nodes.viewport.addEventListener("pointermove", zoomInput.onPointerMove, { signal, passive: false })
        nodes.viewport.addEventListener("pointerup", zoomInput.onPointerUp, { signal })
        nodes.viewport.addEventListener("pointercancel", zoomInput.onPointerCancel, { signal })
        nodes.viewport.addEventListener("wheel", zoomInput.onWheel, { signal, passive: false })
    }

    function tearDownOverlay(unmountOpts?: { linger?: boolean }): void {
        chrome.unbindKeys()
        chrome.unmountAll()
        filmstrip.destroy()
        panes.reset()
        zoomInput.reset()
        ghostFlight.cancel()
        ghostFlight.uncover()
        let linger = unmountOpts?.linger ?? swipe.dismissing()
        swipe.reset()
        viewer.setGesturing(false)
        cancelRaf()
        zoom.reset()
        if (viewer.decodeFn()) decodePort.abortExcept([])
        let currentShell = shell
        shell = null
        currentShell?.destroy()
        if (overlayNodes() != null) {
            viewer.notifyVisible({ stage: "", peeks: [], thumbs: [] })
        }
        lastContentId = null
        startedOpen = false
        // zoom.reset may have scheduled a frame while overlay was still set.
        cancelRaf()
        overlayHandle.unmount({ linger })
    }

    function paintOpen(): void {
        let snap = viewer.snapshot()
        if (!snap.open) {
            tearDownOverlay()
            paintedOpenSeq = -1
            return
        }
        let isFreshOpen = overlayNodes() == null || openSeq !== paintedOpenSeq
        if (isFreshOpen && overlayNodes() != null) tearDownOverlay()
        let created = overlayNodes() == null
        if (created) {
            let nodes = overlayHandle.mount()
            bindZoomInputListeners(nodes)
            startedOpen = false
        }
        paintedOpenSeq = openSeq
        ensureShell()
        panes.paintPanes(snap)
        if (snap.current?.id !== lastContentId) {
            zoomInput.clearWheelZoomRelease()
            zoom.reset()
            lastContentId = snap.current?.id ?? null
        }
        if (shell && snap.current) {
            let nav = viewer.lastNav()
            if (nav) shell.markNav(nav)
            shell.trackContentKey(`${snap.index}:${snap.current.id}`)
        }
        chrome.sync()
        filmstrip.paint(snap)
        let nodes = overlayNodes()
        if (!nodes) return
        chrome.bindKeys()
        if (created) {
            nodes.overlay.setAttribute("data-phase", "opening")
            nodes.overlay.removeAttribute("data-scrim")
            void nodes.overlay.offsetWidth
        }
        applyOverlayAttrs()
        zoomInput.measureZoom()
        if (created && !startedOpen) {
            startedOpen = true
            void shell?.startOpen().then(() => {
                if (detached) return
                applyOverlayAttrs()
                if (filmstrip.morph(viewer.snapshot()).live) return
                filmstrip.centerCurrent("instant")
            })
            nodes.overlay.focus({ preventScroll: true })
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
        overlayHandle.clearLinger()
        decodePort.destroy()
        swipe.destroy()
        zoom.destroy()
        ghostFlight.cancel()
    }
}
