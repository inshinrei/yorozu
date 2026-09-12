/**
 * Overlay + stage + optional filmstrip + chrome slots. Host paints chrome; this module owns gestures and ghost flight.
 */
import { dualRaf, isRectFullyVisibleIn, prefersReducedMotion } from "@yorozu/animations"
import { createVirtualList, listSliceForViewport, type VirtualList } from "@yorozu/virtual-list"
import { applyCanvasImageSource, createMediaDecodePort, type MediaDecodeRole } from "./decode"
import { computeStageFitRectFromElement, createMediaGhost, DEFAULT_MEDIA_INSETS, type MediaGhost } from "./ghost"
import { bindMediaViewerKeys } from "./keyboard"
import { fitContain, stageContentSize } from "./layout"
import { captureOriginFromDom, queryMediaOriginEl } from "./origin"
import { createMediaShell, type MediaShell } from "./shell"
import { createMediaSwipe, type MediaSwipe } from "./swipe-controller"
import { MEDIA_SWIPE_WHEEL_COOLDOWN_MS } from "./swipe"
import type {
    MediaViewer,
    MediaViewerChrome,
    MediaViewerChromeApi,
    MediaViewerItem,
    MediaViewerNavFrom,
    MediaViewerNeighbor,
    MediaViewerOpenOpts,
    MediaViewerSnapshot,
} from "./types"
import { MEDIA_WHEEL_ZOOM_RELEASE_MS, wheelIntent, wheelPanDeltas, type MediaPoint } from "./zoom"
import { createMediaImageZoom, type MediaImageZoom } from "./zoom-controller"

export type AttachMediaViewerOpts = {
    getGhostHost?: () => HTMLElement | null
    getHistoryClipRoot?: () => HTMLElement | null
    prefersReducedMotion?: () => boolean
    ariaLabel?: string
}

const TAP_MOVE_PX: number = 10

type SlotName = "header" | "footer" | "overlay"

function paddingPx(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === "") return fallback
    let n = parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
}

function readPadding(el: HTMLElement): { top: number; right: number; bottom: number; left: number } {
    let style = typeof getComputedStyle === "function" ? getComputedStyle(el) : null
    return {
        top: paddingPx(style?.paddingTop, DEFAULT_MEDIA_INSETS.top),
        right: paddingPx(style?.paddingRight, DEFAULT_MEDIA_INSETS.right),
        bottom: paddingPx(style?.paddingBottom, DEFAULT_MEDIA_INSETS.bottom),
        left: paddingPx(style?.paddingLeft, DEFAULT_MEDIA_INSETS.left),
    }
}

function viewportFallback(): { width: number; height: number } {
    if (typeof window === "undefined") return { width: 800, height: 800 }
    return { width: window.innerWidth || 800, height: window.innerHeight || 800 }
}

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
    let viewport: HTMLElement | null = null
    let strip: HTMLElement | null = null
    let header: HTMLElement | null = null
    let footer: HTMLElement | null = null
    let chromeEl: HTMLElement | null = null
    let filmstripEl: HTMLElement | null = null
    let filmstripIds: string | null = null
    let filmstripCenteredIndex: number | null = null
    let filmstripList: VirtualList<string> | null = null
    let filmstripListItemSize: number | null = null
    let shell: MediaShell | null = null

    let mounted: { header?: MediaViewerChrome; footer?: MediaViewerChrome; overlay?: MediaViewerChrome } = {}
    let unmounts: { header?: () => void; footer?: () => void; overlay?: () => void } = {}
    let paneKeys = new WeakMap<HTMLElement, string>()
    let paneIds: { older?: string; active?: string; newer?: string } = {}
    let thumbDecodeKeys = new WeakMap<HTMLElement, string>()
    let decodePort = createMediaDecodePort({ budget: viewer.decodeBudget() })

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
            if (current?.kind === "image" && zoom.isZoomed()) return false
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
        let hidden = shell != null && !shell.mediaRevealed() && phase !== "closing"
        if (hidden) overlay.setAttribute("data-media-hidden", "")
        else overlay.removeAttribute("data-media-hidden")
        let dismiss = swipe.dismissing() || swipe.axis() === "vertical"
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
            onLand: async () => {
                await hooks.onLand()
                applyOverlayAttrs()
            },
        })
        if (!handle) return false
        let ran = await handle.done
        applyOverlayAttrs()
        return ran
    }

    async function runCloseGhost(): Promise<boolean> {
        applyOverlayAttrs()
        let snap = viewer.snapshot()
        let current = snap.current
        let live = current ? captureOriginFromDom(current.id) : null
        let target = live ?? snap.origin
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
        let fadeOut = target == null
        if (target) {
            let clipEl = opts?.getHistoryClipRoot?.()
            if (clipEl) {
                let clip = clipEl.getBoundingClientRect()
                fadeOut = !isRectFullyVisibleIn(target.rect, {
                    top: clip.top,
                    left: clip.left,
                    width: clip.width,
                    height: clip.height,
                })
            }
        }
        let hideTarget = current ? queryMediaOriginEl(current.id) : null
        let handle = ghost.playClose({
            host: ghostHost(),
            fromStage,
            target,
            imageUrl: current?.src ?? target?.imageUrl ?? null,
            bitmap: ghostBitmap(),
            fadeOut,
            hideTarget,
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

    function isImage(): boolean {
        return viewer.snapshot().current?.kind === "image"
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
            if (!isImage()) return
            zoom.zoomIn()
            scheduleRender()
        },
        zoomOut: (): void => {
            if (!isImage()) return
            zoom.zoomOut()
            scheduleRender()
        },
        resetZoom: (): void => {
            if (!isImage()) return
            zoom.reset()
            scheduleRender()
        },
        percentLabel: (): string => zoom.percentLabel(),
        scale: (): number => zoom.scale(),
        onZoomChange: (listener: () => void): (() => void) => zoom.onChange(listener),
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
                if (current?.kind === "image" && zoom.isZoomed()) return false
                return true
            },
            getAllowZoom: (): boolean => viewer.snapshot().current?.kind === "image",
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

    function unmountAllChrome(): void {
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

    function placePane(el: HTMLElement, side: "older" | "active" | "newer"): void {
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
        return `${side}:${item.id}:${item.kind}:${item.src ?? ""}:${poster}:${alt}`
    }

    function peekBitmapSrc(item: MediaViewerNeighbor): string | null {
        if (item.kind === "video") {
            return typeof item.poster === "string" && item.poster.length > 0 ? item.poster : null
        }
        return item.src ?? null
    }

    function fillPeek(pane: HTMLElement, item: MediaViewerNeighbor, side: "older" | "newer"): void {
        let hostDecode = viewer.decodeFn()
        let src = peekBitmapSrc(item)
        if (hostDecode && src) {
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            pane.append(loading)
            let key = paneKeys.get(pane)
            let role: MediaDecodeRole = side === "older" ? "peek-older" : "peek-newer"
            void decodePort
                .request({ id: item.id, role, src, decode: hostDecode })
                .then((source: CanvasImageSource | null): void => {
                    if (detached || !pane.isConnected || paneKeys.get(pane) !== key) return
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
                image.src = poster
                image.alt = ""
                image.draggable = false
                pane.append(image)
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
            image.src = item.src
            image.alt = ""
            image.draggable = false
            pane.append(image)
            return
        }
        let loading = document.createElement("div")
        loading.setAttribute("data-yorozu-media-loading", "")
        pane.append(loading)
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
        if (!item.src) {
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            pane.append(loading)
            return
        }
        let hostDecode = viewer.decodeFn()
        let wrap = document.createElement("div")
        wrap.setAttribute("data-yorozu-media-zoom", "")
        if (hostDecode) {
            let loading = document.createElement("div")
            loading.setAttribute("data-yorozu-media-loading", "")
            wrap.append(loading)
            pane.append(wrap)
            let key = paneKeys.get(pane)
            let alt = "alt" in item && item.alt ? item.alt : ""
            void decodePort
                .request({ id: item.id, role: "active", src: item.src, decode: hostDecode })
                .then((source: CanvasImageSource | null): void => {
                    if (detached || !pane.isConnected || paneKeys.get(pane) !== key) return
                    wrap.replaceChildren()
                    if (source) {
                        let painted = applyCanvasImageSource(wrap, source, { stage: true, alt })
                        if (painted instanceof HTMLImageElement) {
                            painted.addEventListener("load", () => measureZoom())
                            if (painted.complete) measureZoom()
                            return
                        }
                    }
                    measureZoom()
                })
            return
        }
        let image = document.createElement("img")
        image.setAttribute("data-yorozu-media-stage", "")
        image.src = item.src
        image.alt = "alt" in item && item.alt ? item.alt : ""
        image.draggable = false
        image.addEventListener("load", () => measureZoom())
        wrap.append(image)
        pane.append(wrap)
        if (image.complete) measureZoom()
    }

    function syncPane(
        side: "older" | "active" | "newer",
        item: MediaViewerItem | MediaViewerNeighbor | null,
        keep: Set<string>,
    ): void {
        if (!strip) return
        let existing = strip.querySelector(`[data-side="${side}"]`) as HTMLElement | null
        let prevId = paneIds[side]
        if (item == null) {
            existing?.remove()
            delete paneIds[side]
            if (viewer.decodeFn() && prevId && !keep.has(prevId)) decodePort.abort(prevId)
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
        } else if (viewer.decodeFn() && prevId && !keep.has(prevId)) {
            decodePort.abort(prevId)
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
        if (viewer.decodeFn() && viewer.isGesturing()) decodePort.abortExcept(keep)
        syncPane("older", snap.neighbors.older, keep)
        syncPane("active", snap.current, keep)
        syncPane("newer", snap.neighbors.newer, keep)
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
        if (detached || viewer.isGesturing() || overlay == null || abort == null) return
        if (!viewer.decodeFn()) return
        let snap = viewer.snapshot()
        paintPanes(snap)
        if (!filmstripEl || !snap.filmstrip) return
        let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
        if (!track) return
        for (let el of track.querySelectorAll("[data-yorozu-media-thumb]")) {
            if (!(el instanceof HTMLElement)) continue
            if (el.querySelector("img, canvas")) continue
            thumbDecodeKeys.delete(el)
        }
        syncThumbs(track, snap)
    }

    function itemIdKey(list: readonly MediaViewerItem[]): string {
        return list.map((item) => item.id).join("\0")
    }

    function thumbSrc(item: MediaViewerItem): string | null {
        let helper = viewer.filmstripThumbSrc()
        if (helper) return helper(item)
        return item.poster ?? item.src ?? null
    }

    function markThumbCurrent(btn: HTMLButtonElement, current: boolean): void {
        if (current) {
            btn.setAttribute("aria-current", "true")
            btn.setAttribute("data-current", "")
            btn.disabled = true
            return
        }
        btn.removeAttribute("aria-current")
        btn.removeAttribute("data-current")
        btn.disabled = false
    }

    function fillThumb(btn: HTMLButtonElement, item: MediaViewerItem): void {
        if (item.kind === "video") btn.setAttribute("data-yorozu-media-thumb-video", "")
        else btn.removeAttribute("data-yorozu-media-thumb-video")
        let src = thumbSrc(item)
        let hostDecode = viewer.decodeFn()
        if (hostDecode && src) {
            let key = `${item.id}:${src}`
            if (thumbDecodeKeys.get(btn) === key) return
            thumbDecodeKeys.set(btn, key)
            btn.querySelector("img")?.remove()
            btn.querySelector("canvas")?.remove()
            let existingLoading = btn.querySelector("[data-yorozu-media-loading]")
            if (!existingLoading) {
                let placeholder = document.createElement("div")
                placeholder.setAttribute("data-yorozu-media-loading", "")
                btn.append(placeholder)
            }
            void decodePort
                .request({
                    id: `thumb:${item.id}`,
                    role: "thumb",
                    src,
                    decode: (req) => hostDecode({ ...req, id: item.id }),
                })
                .then((source: CanvasImageSource | null): void => {
                    if (detached || thumbDecodeKeys.get(btn) !== key) return
                    btn.replaceChildren()
                    if (source) applyCanvasImageSource(btn, source, { alt: item.alt ?? "" })
                })
            return
        }
        let image = btn.querySelector("img")
        let loading = btn.querySelector("[data-yorozu-media-loading]")
        if (src) {
            loading?.remove()
            if (image instanceof HTMLImageElement) {
                if (image.getAttribute("src") !== src) image.src = src
                image.alt = item.alt ?? ""
                image.draggable = false
                return
            }
            let next = document.createElement("img")
            next.src = src
            next.alt = item.alt ?? ""
            next.draggable = false
            btn.append(next)
            return
        }
        image?.remove()
        if (loading) return
        let placeholder = document.createElement("div")
        placeholder.setAttribute("data-yorozu-media-loading", "")
        btn.append(placeholder)
    }

    function destroyFilmstripList(): void {
        filmstripList?.destroy()
        filmstripList = null
        filmstripListItemSize = null
    }

    function filmstripSlice(viewportWidth: number): number {
        let itemSizePx = viewer.filmstripItemSizePx()
        let overscan = viewer.filmstripOverscan()
        return listSliceForViewport(viewportWidth, itemSizePx, {
            overscanRows: overscan,
            min: Math.max(4, overscan + 2),
        })
    }

    function onFilmstripWindowChange(): void {
        if (detached || !filmstripEl || !filmstripList) return
        let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
        if (!track) return
        rebuildVirtualThumbs(track, viewer.snapshot())
    }

    function ensureFilmstripList(): VirtualList<string> {
        let itemSizePx = viewer.filmstripItemSizePx()
        if (filmstripList && filmstripListItemSize === itemSizePx) {
            filmstripList.setListSlice(filmstripSlice(filmstripEl?.clientWidth ?? 0))
            return filmstripList
        }
        destroyFilmstripList()
        filmstripListItemSize = itemSizePx
        filmstripList = createVirtualList({
            getItems: (): readonly string[] => viewer.snapshot().items.map((item) => item.id),
            itemSize: itemSizePx,
            listSlice: filmstripSlice(filmstripEl?.clientWidth ?? 0),
            onChange: onFilmstripWindowChange,
            // Idle trim re-slices with LIST_SLICE_MIN (16); skip so a compact strip can stay smaller.
            scheduleIdle: (): { cancel(): void } => ({
                cancel(): void {},
            }),
        })
        return filmstripList
    }

    function syncFilmstripScroll(scrollLeft: number): void {
        if (!filmstripList || !filmstripEl) return
        filmstripList.setListSlice(filmstripSlice(filmstripEl.clientWidth))
        // Engine is vertical: map strip scrollLeft → scrollTop, clientWidth → viewportHeight.
        filmstripList.onScroll({
            scrollTop: scrollLeft,
            viewportHeight: filmstripEl.clientWidth,
        })
    }

    function onFilmstripScroll(): void {
        if (!filmstripEl) return
        syncFilmstripScroll(filmstripEl.scrollLeft)
    }

    function rebuildThumbs(track: HTMLElement, snap: MediaViewerSnapshot): void {
        track.replaceChildren()
        for (let i = 0; i < snap.items.length; i++) {
            let item = snap.items[i]!
            let btn = document.createElement("button")
            btn.type = "button"
            btn.setAttribute("data-yorozu-media-thumb", "")
            btn.setAttribute("data-index", String(i))
            markThumbCurrent(btn, i === snap.index)
            fillThumb(btn, item)
            track.append(btn)
        }
    }

    function rebuildVirtualThumbs(track: HTMLElement, snap: MediaViewerSnapshot): void {
        if (!filmstripList) return
        let ids = filmstripList.viewportIds() ?? []
        let from = filmstripList.fromOffset()
        let prev = new Map<string, HTMLButtonElement>()
        for (let el of track.querySelectorAll("[data-yorozu-media-thumb]")) {
            if (!(el instanceof HTMLButtonElement)) continue
            let id = el.getAttribute("data-id")
            if (id) prev.set(id, el)
        }
        let next: HTMLButtonElement[] = []
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i]!
            let index = from + i
            let item = snap.items[index]
            if (item == null || item.id !== id) {
                let found = snap.items.findIndex((it) => it.id === id)
                if (found < 0) continue
                index = found
                item = snap.items[found]!
            }
            let btn = prev.get(id)
            if (!btn) {
                btn = document.createElement("button")
                btn.type = "button"
                btn.setAttribute("data-yorozu-media-thumb", "")
                btn.setAttribute("data-id", id)
            }
            btn.setAttribute("data-index", String(index))
            btn.style.position = "absolute"
            btn.style.left = `${filmstripList.rowTop(index)}px`
            markThumbCurrent(btn, index === snap.index)
            fillThumb(btn, item)
            next.push(btn)
        }
        track.style.width = `${filmstripList.totalSize()}px`
        track.style.flexShrink = "0"
        track.style.flexGrow = "0"
        track.replaceChildren(...next)
    }

    function syncThumbs(track: HTMLElement, snap: MediaViewerSnapshot): void {
        if (filmstripList) {
            rebuildVirtualThumbs(track, snap)
            return
        }
        let thumbs = track.querySelectorAll("[data-yorozu-media-thumb]")
        for (let i = 0; i < snap.items.length; i++) {
            let el = thumbs[i]
            if (!(el instanceof HTMLButtonElement)) continue
            markThumbCurrent(el, i === snap.index)
            fillThumb(el, snap.items[i]!)
        }
    }

    function centerCurrentThumb(behavior: ScrollBehavior): void {
        if (!filmstripEl) return
        if (viewer.filmstripVirtualize()) {
            let index = viewer.snapshot().index
            let itemSizePx = viewer.filmstripItemSizePx()
            let viewportWidth = filmstripEl.clientWidth
            let left = index * itemSizePx + itemSizePx / 2 - viewportWidth / 2
            if (left < 0) left = 0
            if (typeof filmstripEl.scrollTo === "function") {
                filmstripEl.scrollTo({ left, behavior })
            } else {
                filmstripEl.scrollLeft = left
            }
            // Smooth: live scrollLeft is still the old offset; let the scroll event drive the engine.
            if (behavior === "smooth") return
            syncFilmstripScroll(left)
            return
        }
        let current = filmstripEl.querySelector("[data-yorozu-media-thumb][data-current]")
        if (!(current instanceof HTMLElement)) return
        let stripBox = filmstripEl.getBoundingClientRect()
        let thumbBox = current.getBoundingClientRect()
        if (!(stripBox.width > 0) || !(thumbBox.width > 0)) return
        let left = filmstripEl.scrollLeft + (thumbBox.left + thumbBox.width / 2) - (stripBox.left + stripBox.width / 2)
        if (typeof filmstripEl.scrollTo === "function") {
            filmstripEl.scrollTo({ left, behavior })
            return
        }
        filmstripEl.scrollLeft = left
    }

    function onFilmstripClick(e: Event): void {
        let t = e.target
        if (!(t instanceof Element)) return
        let btn = t.closest("[data-yorozu-media-thumb]")
        if (!(btn instanceof HTMLButtonElement) || btn.disabled) return
        let i = Number(btn.getAttribute("data-index"))
        if (!Number.isInteger(i)) return
        viewer.goTo(i)
    }

    function removeFilmstrip(): void {
        destroyFilmstripList()
        filmstripEl?.remove()
        filmstripEl = null
        filmstripIds = null
        filmstripCenteredIndex = null
    }

    function paintFilmstrip(snap: MediaViewerSnapshot): void {
        if (!overlay) return
        if (!snap.filmstrip) {
            removeFilmstrip()
            return
        }
        let virtualize = viewer.filmstripVirtualize()
        let itemSizePx = viewer.filmstripItemSizePx()
        let createdThisPaint = false
        if (!filmstripEl) {
            createdThisPaint = true
            filmstripEl = document.createElement("nav")
            filmstripEl.setAttribute("data-yorozu-media-filmstrip", "")
            filmstripEl.setAttribute("role", "navigation")
            filmstripEl.setAttribute("aria-label", "Gallery items")
            let track = document.createElement("div")
            track.setAttribute("role", "list")
            filmstripEl.append(track)
            filmstripEl.addEventListener("click", onFilmstripClick, abort ? { signal: abort.signal } : undefined)
            filmstripEl.addEventListener("scroll", onFilmstripScroll, abort ? { signal: abort.signal } : undefined)
            overlay.append(filmstripEl)
            filmstripIds = null
        }
        if (virtualize) {
            filmstripEl.setAttribute("data-virtualized", "")
            filmstripEl.style.setProperty("--yorozu-media-filmstrip-item-size", `${itemSizePx}px`)
        } else {
            filmstripEl.removeAttribute("data-virtualized")
            filmstripEl.style.removeProperty("--yorozu-media-filmstrip-item-size")
            destroyFilmstripList()
        }
        let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
        if (!track) return
        let shouldCenter = true
        if (virtualize) {
            let ids = itemIdKey(snap.items)
            let idsChanged = filmstripIds !== ids
            let indexChanged = filmstripCenteredIndex !== snap.index
            let shouldReanchor = idsChanged || indexChanged || filmstripCenteredIndex == null
            let list = ensureFilmstripList()
            list.sync()
            if (shouldReanchor) list.reanchor(snap.index)
            rebuildVirtualThumbs(track, snap)
            filmstripIds = ids
            if (shouldReanchor) filmstripCenteredIndex = snap.index
            shouldCenter = shouldReanchor
        } else {
            track.style.width = ""
            track.style.flexShrink = ""
            track.style.flexGrow = ""
            filmstripCenteredIndex = null
            let ids = itemIdKey(snap.items)
            if (filmstripIds !== ids) {
                rebuildThumbs(track, snap)
                filmstripIds = ids
            } else {
                syncThumbs(track, snap)
            }
        }
        if (!shouldCenter) return
        let instant = reducedMotion() || createdThisPaint || (shell != null && shell.openPhase() !== "open")
        let behavior: ScrollBehavior = instant ? "instant" : "smooth"
        centerCurrentThumb(behavior)
        void dualRaf().then(() => {
            if (detached || !filmstripEl) return
            centerCurrentThumb(behavior)
        })
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
        if (!isImage()) return
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
        if (isImage() && pointers.size >= 2) {
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
                if (!zoomDragging && !pinching && isImage() && zoom.isZoomed()) {
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
        if (isImage()) {
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

        header = document.createElement("div")
        header.setAttribute("data-yorozu-media-header", "")
        footer = document.createElement("div")
        footer.setAttribute("data-yorozu-media-footer", "")
        chromeEl = document.createElement("div")
        chromeEl.setAttribute("data-yorozu-media-chrome", "")

        overlay.append(viewport, header, footer, chromeEl)
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
        abort?.abort()
        abort = null
        cancelRaf()
        clearWheelZoomRelease()
        lastWheelZoomOrigin = null
        ghost.cancel()
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
        destroyFilmstripList()
        filmstripEl = null
        filmstripIds = null
        filmstripCenteredIndex = null
        paneIds = {}
        if (viewer.decodeFn()) decodePort.abortExcept([])
        let currentShell = shell
        shell = null
        currentShell?.destroy()
        overlay?.remove()
        overlay = null
        viewport = null
        strip = null
        header = null
        footer = null
        chromeEl = null
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
        paintPanes(snap)
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
        paintFilmstrip(snap)
        if (!overlay) return
        bindKeys()
        applyOverlayAttrs()
        measureZoom()
        if (created && !startedOpen) {
            startedOpen = true
            void shell?.startOpen().then(() => {
                applyOverlayAttrs()
                centerCurrentThumb("instant")
            })
            overlay.focus({ preventScroll: true })
        }
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
