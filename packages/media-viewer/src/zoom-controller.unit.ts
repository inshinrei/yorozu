// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { createMediaImageZoom } from "./zoom-controller"
import { MEDIA_MAX_ZOOM_FACTOR, MEDIA_MIN_SCALE, MEDIA_ZOOM_STEP } from "./zoom"

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

    it("wheel hard-clamps without soft overshoot", () => {
        let zoom = sizedZoom()
        // Large wheel notches should still land ≤ max
        for (let i = 0; i < 80; i++) zoom.applyWheel(-900, { offsetX: 0, offsetY: 0 })
        expect(zoom.scale()).toBeLessThanOrEqual(MEDIA_MAX_ZOOM_FACTOR)
        expect(zoom.scale()).toBe(MEDIA_MAX_ZOOM_FACTOR)
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
})
