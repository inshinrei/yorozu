import { fitContain, stageContentSize } from "../layout"
import type { MediaSwipe } from "../swipe-controller"
import type { MediaViewer } from "../types"
import { MEDIA_WHEEL_ZOOM_RELEASE_MS, wheelIntent, wheelPanDeltas, type MediaPoint } from "../zoom"
import type { MediaImageZoom } from "../zoom-controller"
import { isZoomable, readPadding, TAP_MOVE_PX, viewportFallback } from "./css"

export type AttachZoomInput = {
    measureZoom: () => void
    onPointerDown: (e: PointerEvent) => void
    onPointerMove: (e: PointerEvent) => void
    onPointerUp: (e: PointerEvent) => void
    onPointerCancel: (e: PointerEvent) => void
    onWheel: (e: WheelEvent) => void
    clearWheelZoomRelease: () => void
    reset: () => void
    takeChromeTap: () => boolean
}

export function createZoomInput(opts: {
    getOverlay: () => HTMLElement | null
    getViewport: () => HTMLElement | null
    viewer: MediaViewer
    zoom: MediaImageZoom
    swipe: MediaSwipe
    isDetached: () => boolean
    scheduleRender: () => void
}): AttachZoomInput {
    let tapPointerId: number | null = null
    let tapX = 0
    let tapY = 0
    let tapMoved = false
    let chromeTapEligible = false
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

    function pointFromEvent(e: { clientX: number; clientY: number }): MediaPoint {
        let overlay = opts.getOverlay()
        let viewport = opts.getViewport()
        let el = (overlay?.querySelector("[data-yorozu-media-zoom]") as HTMLElement | null) ?? viewport
        if (!el) return { offsetX: 0, offsetY: 0 }
        let box = el.getBoundingClientRect()
        return {
            offsetX: e.clientX - (box.left + box.width / 2),
            offsetY: e.clientY - (box.top + box.height / 2),
        }
    }

    function measureStageEl(): HTMLElement | null {
        let overlay = opts.getOverlay()
        let viewport = opts.getViewport()
        if (!overlay) return viewport
        let zoomEl = overlay.querySelector("[data-yorozu-media-zoom]")
        if (zoomEl instanceof HTMLElement) return zoomEl
        let active = overlay.querySelector('[data-side="active"]')
        if (active instanceof HTMLElement) return active
        return viewport
    }

    function measureZoom(): void {
        if (opts.isDetached()) return
        let viewport = opts.getViewport()
        if (!viewport) return
        let current = opts.viewer.snapshot().current
        let stage = measureStageEl() ?? viewport
        let fallback = viewportFallback()
        let vw = stage.clientWidth || fallback.width
        let vh = stage.clientHeight || fallback.height
        let content = stageContentSize(vw, vh, readPadding(stage))
        opts.zoom.setViewportSize(content.width, content.height)
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
            opts.zoom.setNaturalSize(nw, nh)
            let fit = fitContain({ width: nw, height: nh }, content)
            if (fit) opts.zoom.setLayoutSize(fit.width, fit.height)
            else opts.zoom.setLayoutSize(content.width, content.height)
        } else {
            opts.zoom.setLayoutSize(content.width, content.height)
        }
        opts.scheduleRender()
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
            opts.zoom.endDrag({ withInertia: false, pinchOrigin: lastWheelZoomOrigin })
            opts.scheduleRender()
        }, MEDIA_WHEEL_ZOOM_RELEASE_MS)
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
        if (!isZoomable(opts.viewer.snapshot().current)) return
        pinching = true
        tapMoved = true
        chromeTapEligible = false
        if (zoomDragging) {
            zoomDragging = false
            opts.zoom.endDrag({ withInertia: false })
        }
        opts.swipe.reset()
        pinchDist = pinchDistance()
        pinchOrigin = pinchMidpoint()
        opts.zoom.beginDrag()
    }

    function endPinch(): void {
        if (!pinching) return
        pinching = false
        zoomDragging = false
        opts.zoom.endDrag({ pinchOrigin, withInertia: false })
        pinchOrigin = null
        pinchDist = 0
    }

    function onViewportPointerDown(e: PointerEvent): void {
        let t = e.target
        if (!(t instanceof Element && t.closest("button, a, input, textarea, select, video"))) {
            try {
                opts.getViewport()?.setPointerCapture(e.pointerId)
            } catch {
                // optional
            }
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (isZoomable(opts.viewer.snapshot().current) && pointers.size >= 2) {
            chromeTapEligible = false
            if (!pinching) startPinch()
            opts.scheduleRender()
            return
        }
        tapPointerId = e.pointerId
        tapX = e.clientX
        tapY = e.clientY
        tapMoved = false
        chromeTapEligible = true
        dragOriginX = e.clientX
        dragOriginY = e.clientY
        if (opts.swipe.onPointerDown(e)) {
            zoomDragging = false
            opts.scheduleRender()
            return
        }
        opts.scheduleRender()
    }

    function onViewportPointerMove(e: PointerEvent): void {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pinching && pointers.size >= 2) {
            chromeTapEligible = false
            e.preventDefault()
            let dist = pinchDistance()
            if (pinchDist > 0 && dist > 0) {
                let amount = dist / pinchDist - 1
                pinchOrigin = pinchMidpoint()
                opts.zoom.applyRelativeZoomSoft(amount, pinchOrigin)
                pinchDist = dist
            }
            opts.scheduleRender()
            return
        }
        if (tapPointerId === e.pointerId) {
            if (Math.hypot(e.clientX - tapX, e.clientY - tapY) > TAP_MOVE_PX) {
                tapMoved = true
                chromeTapEligible = false
                if (!zoomDragging && !pinching && isZoomable(opts.viewer.snapshot().current) && opts.zoom.isZoomed()) {
                    opts.zoom.beginDrag()
                    zoomDragging = true
                    let start = opts.zoom.getDragStartTranslate()
                    dragStartX = start.translateX
                    dragStartY = start.translateY
                    try {
                        opts.getViewport()?.setPointerCapture(e.pointerId)
                    } catch {
                        // optional
                    }
                }
            }
        }
        if (zoomDragging) {
            chromeTapEligible = false
            e.preventDefault()
            opts.zoom.moveDrag(e.clientX - dragOriginX, e.clientY - dragOriginY, dragStartX, dragStartY)
            opts.scheduleRender()
            return
        }
        opts.swipe.onPointerMove(e)
        opts.scheduleRender()
    }

    function onViewportPointerUp(e: PointerEvent): void {
        pointers.delete(e.pointerId)
        if (pinching) {
            chromeTapEligible = false
            if (pointers.size < 2) endPinch()
            if (tapPointerId === e.pointerId) tapPointerId = null
            opts.scheduleRender()
            return
        }
        if (zoomDragging) {
            chromeTapEligible = false
            zoomDragging = false
            opts.zoom.endDrag()
            if (tapPointerId === e.pointerId) tapPointerId = null
            opts.scheduleRender()
            return
        }
        let swipeMoved = opts.swipe.offsetX() !== 0 || opts.swipe.offsetY() !== 0
        opts.swipe.onPointerUp(e)
        if (swipeMoved || opts.swipe.offsetX() !== 0 || opts.swipe.offsetY() !== 0) {
            chromeTapEligible = false
        }
        if (tapPointerId === e.pointerId) {
            tapPointerId = null
        }
        opts.scheduleRender()
    }

    function onViewportPointerCancel(e: PointerEvent): void {
        chromeTapEligible = false
        pointers.delete(e.pointerId)
        if (pinching) {
            if (pointers.size < 2) endPinch()
            if (tapPointerId === e.pointerId) tapPointerId = null
            opts.scheduleRender()
            return
        }
        if (zoomDragging) {
            zoomDragging = false
            opts.zoom.endDrag({ withInertia: false })
        }
        opts.swipe.onPointerCancel(e)
        if (tapPointerId === e.pointerId) tapPointerId = null
        opts.scheduleRender()
    }

    function onViewportWheel(e: WheelEvent): void {
        if (isZoomable(opts.viewer.snapshot().current)) {
            let intent = wheelIntent(opts.zoom.isZoomed(), e.ctrlKey || e.metaKey)
            if (intent === "zoom") {
                e.preventDefault()
                e.stopPropagation()
                let origin = pointFromEvent(e)
                opts.zoom.applyWheel(e.deltaY, origin)
                armWheelZoomRelease(origin)
                opts.scheduleRender()
                return
            }
            if (intent === "pan") {
                e.preventDefault()
                e.stopPropagation()
                let pan = wheelPanDeltas(e.deltaX, e.deltaY, e.deltaMode)
                opts.zoom.panBy(-pan.deltaX, -pan.deltaY)
                opts.scheduleRender()
                return
            }
        }
        opts.swipe.trapWheel(e)
        opts.scheduleRender()
    }

    function takeChromeTap(): boolean {
        if (!chromeTapEligible) return false
        chromeTapEligible = false
        return true
    }

    function reset(): void {
        clearWheelZoomRelease()
        zoomDragging = false
        tapPointerId = null
        tapMoved = false
        chromeTapEligible = false
        pointers.clear()
        pinching = false
        pinchOrigin = null
        pinchDist = 0
        lastWheelZoomOrigin = null
    }

    return {
        measureZoom,
        onPointerDown: onViewportPointerDown,
        onPointerMove: onViewportPointerMove,
        onPointerUp: onViewportPointerUp,
        onPointerCancel: onViewportPointerCancel,
        onWheel: onViewportWheel,
        clearWheelZoomRelease,
        reset,
        takeChromeTap,
    }
}
