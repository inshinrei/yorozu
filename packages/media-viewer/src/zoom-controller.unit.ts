// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { createMediaImageZoom } from "./zoom-controller"
import {
    MEDIA_MAX_ZOOM_FACTOR,
    MEDIA_MIN_SCALE,
    MEDIA_SOFT_SCALE_MAX_FACTOR,
    MEDIA_ZOOM_SETTLE_MS,
    MEDIA_ZOOM_STEP,
} from "./zoom"

describe("createMediaImageZoom", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    function sizedZoom(opts?: { prefersReducedMotion?: () => boolean }) {
        let zoom = createMediaImageZoom(opts)
        zoom.setNaturalSize(800, 600)
        zoom.setLayoutSize(400, 300)
        zoom.setViewportSize(400, 300)
        return zoom
    }

    it("zoomIn steps 1 → 1.25; isZoomed; toggleZoom to max; reset to 1", () => {
        let zoom = sizedZoom()
        expect(zoom.scale()).toBe(MEDIA_MIN_SCALE)
        expect(zoom.isZoomed()).toBe(false)

        zoom.zoomIn()
        expect(zoom.scale()).toBe(MEDIA_ZOOM_STEP)
        expect(zoom.isZoomed()).toBe(true)
        expect(zoom.canZoomOut()).toBe(true)

        zoom.toggleZoom()
        expect(zoom.scale()).toBe(MEDIA_MAX_ZOOM_FACTOR)

        zoom.reset()
        expect(zoom.scale()).toBe(MEDIA_MIN_SCALE)
        expect(zoom.isZoomed()).toBe(false)
        expect(zoom.translateX()).toBe(0)
        expect(zoom.translateY()).toBe(0)

        zoom.destroy()
    })

    it("transformStyle uses translate3d + scale", () => {
        let zoom = sizedZoom()
        zoom.zoomIn()
        expect(zoom.transformStyle()).toBe(
            `translate3d(${zoom.translateX()}px, ${zoom.translateY()}px, 0) scale(${zoom.scale()})`,
        )
        expect(zoom.percentLabel()).toBe("125%")
        zoom.destroy()
    })

    it("panBy moves translate when zoomed and ignores when unzoomed", () => {
        let zoom = sizedZoom()
        zoom.panBy(40, -20)
        expect(zoom.translateX()).toBe(0)
        expect(zoom.translateY()).toBe(0)

        zoom.zoomIn()
        // scale 1.25 on 400×300 layout in 400×300 viewport → max translate ≈ 50 / 37.5
        zoom.panBy(40, -20)
        expect(zoom.translateX()).toBeCloseTo(40, 5)
        expect(zoom.translateY()).toBeCloseTo(-20, 5)
        zoom.destroy()
    })

    it("applyRelativeZoomSoft overshoot snaps hard on reduced-motion endDrag", () => {
        let zoom = sizedZoom({ prefersReducedMotion: () => true })
        // Soft max = 20 * 1.15 = 23
        zoom.applyRelativeZoomSoft(22, { offsetX: 0, offsetY: 0 })
        expect(zoom.scale()).toBeGreaterThan(MEDIA_MAX_ZOOM_FACTOR)

        zoom.endDrag({ withInertia: false, pinchOrigin: { offsetX: 0, offsetY: 0 } })
        expect(zoom.scale()).toBe(MEDIA_MAX_ZOOM_FACTOR)
        expect(zoom.isSettling()).toBe(false)
        zoom.destroy()
    })

    it("pinch below fit settles back to 1 with motion", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let zoom = sizedZoom()
        zoom.applyRelativeZoomSoft(-0.85, { offsetX: 0, offsetY: 0 })
        expect(zoom.scale()).toBeLessThan(1)
        expect(zoom.scale()).toBeGreaterThanOrEqual(0.2)
        expect(zoom.scale()).toBeLessThan(0.5)
        zoom.endDrag({ withInertia: false, pinchOrigin: { offsetX: 0, offsetY: 0 } })
        expect(zoom.isSettling()).toBe(true)
        expect(zoom.scale()).toBeLessThan(1)
        // Fake rAF is 16ms; final apply lands on the tick at/after duration.
        vi.advanceTimersByTime(MEDIA_ZOOM_SETTLE_MS + 16)
        expect(zoom.scale()).toBe(1)
        expect(zoom.isSettling()).toBe(false)
        zoom.destroy()
    })

    it("beginDrag / moveDrag / endDrag with inertia settles or snaps", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let zoom = sizedZoom()
        zoom.zoomIn()
        zoom.zoomIn()
        zoom.beginDrag()
        expect(zoom.isDragging()).toBe(true)
        let start = zoom.getDragStartTranslate()
        zoom.moveDrag(30, -10, start.translateX, start.translateY)
        expect(zoom.translateX()).not.toBe(0)
        zoom.endDrag({ withInertia: true })
        expect(zoom.isDragging()).toBe(false)
        zoom.destroy()
    })

    it("setViewportSize / setLayoutSize / setNaturalSize no-op does not stop settle", () => {
        let zoom = sizedZoom()
        zoom.applyRelativeZoomSoft(22, { offsetX: 0, offsetY: 0 })
        expect(zoom.scale()).toBeGreaterThan(MEDIA_MAX_ZOOM_FACTOR)
        zoom.endDrag({ withInertia: false, pinchOrigin: { offsetX: 0, offsetY: 0 } })
        expect(zoom.isSettling()).toBe(true)
        zoom.setViewportSize(400, 300)
        zoom.setLayoutSize(400, 300)
        zoom.setNaturalSize(800, 600)
        expect(zoom.isSettling()).toBe(true)
        expect(zoom.scale()).toBeGreaterThan(MEDIA_MAX_ZOOM_FACTOR)
        zoom.destroy()
    })

    it("wheel live-clamps soft min/max; endDrag settles toward legal", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let zoom = sizedZoom()
        let origin = { offsetX: 0, offsetY: 0 }
        // Positive deltaY → zoom out; soft min is 0.2× fit
        for (let i = 0; i < 40; i++) zoom.applyWheel(900, origin)
        expect(zoom.scale()).toBeGreaterThanOrEqual(0.2)
        expect(zoom.scale()).toBeLessThan(0.5)
        expect(zoom.scale()).toBeLessThan(1)

        zoom.endDrag({ withInertia: false, pinchOrigin: origin })
        expect(zoom.isSettling()).toBe(true)
        expect(zoom.scale()).toBeLessThan(1)
        vi.advanceTimersByTime(MEDIA_ZOOM_SETTLE_MS + 16)
        expect(zoom.scale()).toBe(1)
        expect(zoom.isSettling()).toBe(false)

        // Soft max = hard max × 1.15 during live wheel zoom-in
        for (let i = 0; i < 80; i++) zoom.applyWheel(-900, origin)
        expect(zoom.scale()).toBeGreaterThan(MEDIA_MAX_ZOOM_FACTOR)
        expect(zoom.scale()).toBeLessThanOrEqual(MEDIA_MAX_ZOOM_FACTOR * MEDIA_SOFT_SCALE_MAX_FACTOR)
        zoom.endDrag({ withInertia: false, pinchOrigin: origin })
        vi.advanceTimersByTime(MEDIA_ZOOM_SETTLE_MS + 16)
        expect(zoom.scale()).toBe(MEDIA_MAX_ZOOM_FACTOR)
        zoom.destroy()
    })

    it("wheel undershoot mid-bounce is between undershoot and fit", () => {
        vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame"] })
        let zoom = sizedZoom()
        let origin = { offsetX: 0, offsetY: 0 }
        for (let i = 0; i < 40; i++) zoom.applyWheel(900, origin)
        let undershoot = zoom.scale()
        expect(undershoot).toBeLessThan(1)
        expect(undershoot).toBeGreaterThanOrEqual(0.2)
        expect(undershoot).toBeLessThan(0.5)

        zoom.endDrag({ withInertia: false, pinchOrigin: origin })
        expect(zoom.isSettling()).toBe(true)
        vi.advanceTimersByTime(175)
        expect(zoom.scale()).toBeGreaterThan(undershoot)
        expect(zoom.scale()).toBeLessThan(1)
        vi.advanceTimersByTime(MEDIA_ZOOM_SETTLE_MS)
        expect(zoom.scale()).toBe(1)
        expect(zoom.isSettling()).toBe(false)
        zoom.destroy()
    })

    it("destroy resets scale and translate to identity", () => {
        let zoom = sizedZoom()
        zoom.zoomIn()
        zoom.panBy(40, -20)
        expect(zoom.scale()).toBe(MEDIA_ZOOM_STEP)
        expect(zoom.translateX()).not.toBe(0)
        zoom.destroy()
        expect(zoom.scale()).toBe(1)
        expect(zoom.translateX()).toBe(0)
        expect(zoom.translateY()).toBe(0)
        expect(zoom.transformStyle()).toBe("translate3d(0px, 0px, 0) scale(1)")
    })

    it("onChange fires on zoomIn and unsubscribe is idempotent", () => {
        let zoom = sizedZoom()
        let n = 0
        let stop = zoom.onChange(() => {
            n += 1
        })
        zoom.zoomIn()
        expect(n).toBeGreaterThanOrEqual(1)
        let after = n
        stop()
        stop()
        zoom.zoomIn()
        expect(n).toBe(after)
        zoom.destroy()
    })

    it("idle 100% does not subscribe to requestAnimationFrame", () => {
        let raf = vi.fn((cb: FrameRequestCallback) => {
            cb(0)
            return 1
        })
        vi.stubGlobal("requestAnimationFrame", raf)
        vi.stubGlobal("cancelAnimationFrame", vi.fn())
        let zoom = sizedZoom()
        zoom.onChange(() => {})
        expect(raf).not.toHaveBeenCalled()
        zoom.destroy()
        vi.unstubAllGlobals()
    })

    it("settle notifies on the shared pump and once at rest, then drops the pump", () => {
        vi.useFakeTimers()
        let frames: FrameRequestCallback[] = []
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            frames.push(cb)
            return frames.length
        })
        vi.stubGlobal("cancelAnimationFrame", vi.fn())
        let zoom = sizedZoom()
        let scales: number[] = []
        zoom.onChange(() => {
            scales.push(zoom.scale())
        })
        zoom.applyRelativeZoomSoft(MEDIA_MAX_ZOOM_FACTOR + 2, { offsetX: 0, offsetY: 0 })
        zoom.endDrag({ withInertia: false, pinchOrigin: { offsetX: 0, offsetY: 0 } })
        expect(zoom.isSettling()).toBe(true)
        expect(frames.length).toBeGreaterThan(0)
        let guard = 0
        while (zoom.isSettling() && frames.length && guard < 40) {
            let cb = frames.shift()!
            cb(performance.now() + MEDIA_ZOOM_SETTLE_MS)
            guard += 1
        }
        expect(zoom.isSettling()).toBe(false)
        expect(zoom.scale()).toBe(MEDIA_MAX_ZOOM_FACTOR)
        expect(scales[scales.length - 1]).toBe(MEDIA_MAX_ZOOM_FACTOR)
        let leftover = frames.length
        zoom.onChange(() => {})
        expect(frames.length).toBe(leftover)
        zoom.destroy()
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it("applyState does not notify when scale and translate are unchanged", () => {
        let zoom = sizedZoom()
        let n = 0
        zoom.onChange(() => {
            n += 1
        })
        zoom.zoomIn()
        let after = n
        zoom.setLayoutSize(400, 300)
        expect(n).toBe(after)
        zoom.destroy()
    })

    it("beginDrag then endDrag without motion notifies isDragging false", () => {
        let zoom = sizedZoom()
        zoom.zoomIn()
        let dragging: boolean[] = []
        zoom.onChange(() => {
            dragging.push(zoom.isDragging())
        })
        zoom.beginDrag()
        expect(zoom.isDragging()).toBe(true)
        zoom.endDrag({ withInertia: false })
        expect(zoom.isDragging()).toBe(false)
        expect(dragging).toContain(true)
        expect(dragging[dragging.length - 1]).toBe(false)
        zoom.destroy()
    })
})
