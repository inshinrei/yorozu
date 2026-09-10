/**
 * Presentation-only zoom controller for media photos.
 * Owns scale/translate, pointer pan inertia settle, and pinch soft-overshoot bounce.
 * Plain let + getters — no Svelte $state.
 */
import { easeOutCubic, zoomAtOrigin } from "@yorozu/animations"
import {
    MEDIA_MIN_SCALE,
    canZoomIn as canZoomInScale,
    canZoomOut as canZoomOutScale,
    formatZoomPercent,
    legalizeZoomState,
    lerpZoomState,
    maxScaleFromNatural,
    type MediaPoint,
    type MediaZoomSample,
    type MediaZoomState,
    type MediaZoomVelocity,
    projectPanInertia,
    resetZoom,
    scaleByRelativeAmount,
    softScaleLimits,
    stepScale,
    velocityFromSamples,
    wheelZoomAmount,
    zoomSettleDurationMs,
    zoomStateDistance,
    zoomStatesNearlyEqual,
} from "./zoom"

export type MediaImageZoom = {
    scale: () => number
    translateX: () => number
    translateY: () => number
    maxScale: () => number
    canZoomIn: () => boolean
    canZoomOut: () => boolean
    isZoomed: () => boolean
    isDragging: () => boolean
    isSettling: () => boolean
    percentLabel: () => string
    transformStyle: () => string
    zoomIn: (origin?: MediaPoint | null) => void
    zoomOut: (origin?: MediaPoint | null) => void
    toggleZoom: (origin?: MediaPoint | null) => void
    reset: () => void
    cancelSettle: () => void
    setNaturalSize: (width: number, height: number) => void
    setLayoutSize: (width: number, height: number) => void
    setViewportSize: (width: number, height: number) => void
    applyWheel: (deltaY: number, origin?: MediaPoint | null) => void
    applyRelativeZoom: (amount: number, origin?: MediaPoint | null) => void
    applyRelativeZoomSoft: (amount: number, origin?: MediaPoint | null) => void
    beginDrag: () => void
    moveDrag: (deltaX: number, deltaY: number, startTranslateX: number, startTranslateY: number) => void
    panBy: (deltaX: number, deltaY: number) => void
    endDrag: (opts?: { withInertia?: boolean; pinchOrigin?: MediaPoint | null }) => void
    getDragStartTranslate: () => { translateX: number; translateY: number }
    destroy: () => void
}

export function createMediaImageZoom(opts?: { prefersReducedMotion?: () => boolean }): MediaImageZoom {
    let scale = MEDIA_MIN_SCALE
    let translateX = 0
    let translateY = 0
    let naturalWidth = 0
    let layoutWidth = 0
    let layoutHeight = 0
    let viewportWidth = 0
    let viewportHeight = 0
    let dragging = false
    let settling = false

    let motionSamples: MediaZoomSample[] = []
    let settleRaf: number | null = null
    let settleGen = 0

    function reducedMotion(): boolean {
        return opts?.prefersReducedMotion?.() === true
    }

    function currentMaxScale(): number {
        return maxScaleFromNatural(layoutWidth, naturalWidth)
    }

    function applyState(next: MediaZoomState): void {
        scale = next.scale
        translateX = next.translateX
        translateY = next.translateY
    }

    function current(): MediaZoomState {
        return { scale, translateX, translateY }
    }

    function clearMotionSamples(): void {
        motionSamples = []
    }

    function noteMotionSample(): void {
        let t = typeof performance !== "undefined" ? performance.now() : Date.now()
        motionSamples.push({ t, x: translateX, y: translateY })
        if (motionSamples.length > 24) motionSamples = motionSamples.slice(-16)
    }

    function cancelSettleRaf(): void {
        if (settleRaf != null && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(settleRaf)
            settleRaf = null
        }
    }

    function stopSettle(): void {
        settleGen++
        cancelSettleRaf()
        settling = false
    }

    function setScaleToward(
        nextScale: number,
        origin: MediaPoint | null | undefined,
        minScale: number = MEDIA_MIN_SCALE,
        maxScaleLimit: number = currentMaxScale(),
    ): void {
        stopSettle()
        applyState(
            zoomAtOrigin(
                current(),
                nextScale,
                origin,
                layoutWidth,
                layoutHeight,
                viewportWidth,
                viewportHeight,
                minScale,
                maxScaleLimit,
            ),
        )
    }

    function animateTo(target: MediaZoomState): void {
        stopSettle()
        let from = current()
        if (zoomStatesNearlyEqual(from, target)) {
            applyState(target)
            return
        }
        if (reducedMotion()) {
            applyState(target)
            return
        }

        let remaining = zoomStateDistance(from, target, layoutWidth, layoutHeight)
        let duration = zoomSettleDurationMs(remaining)
        let gen = ++settleGen
        settling = true
        let start = typeof performance !== "undefined" ? performance.now() : Date.now()

        const frame = (now: number): void => {
            if (gen !== settleGen) return
            let t = Math.min(1, (now - start) / duration)
            let eased = easeOutCubic(t)
            let next = lerpZoomState(from, target, eased)
            scale = next.scale
            translateX = next.translateX
            translateY = next.translateY
            if (t < 1) {
                settleRaf = requestAnimationFrame(frame)
                return
            }
            applyState(target)
            settling = false
            settleRaf = null
        }

        if (typeof requestAnimationFrame === "function") {
            settleRaf = requestAnimationFrame(frame)
        } else {
            applyState(target)
            settling = false
        }
    }

    /**
     * After pan / pinch release: legalize scale, then optional pan coast into bounds.
     */
    function settleAfterRelease(endOpts?: { withInertia?: boolean; pinchOrigin?: MediaPoint | null }): void {
        let origin = endOpts?.pinchOrigin
        let maxScale = currentMaxScale()
        let legal = legalizeZoomState(
            current(),
            origin,
            layoutWidth,
            layoutHeight,
            viewportWidth,
            viewportHeight,
            MEDIA_MIN_SCALE,
            maxScale,
        )

        let withInertia = endOpts?.withInertia !== false
        let needsLegalize = !zoomStatesNearlyEqual(current(), legal)

        if (needsLegalize) {
            // Scale rubber bounce takes priority; skip pan coast on the same release.
            animateTo(legal)
            clearMotionSamples()
            return
        }

        if (!withInertia || !canZoomOutScale(scale) || reducedMotion()) {
            applyState(legal)
            clearMotionSamples()
            return
        }

        let now = typeof performance !== "undefined" ? performance.now() : Date.now()
        let velocity: MediaZoomVelocity = velocityFromSamples(motionSamples, now)
        clearMotionSamples()
        let coast = projectPanInertia(legal, velocity, layoutWidth, layoutHeight, viewportWidth, viewportHeight)
        if (zoomStatesNearlyEqual(legal, coast)) {
            applyState(legal)
            return
        }
        animateTo(coast)
    }

    return {
        scale: (): number => scale,
        translateX: (): number => translateX,
        translateY: (): number => translateY,
        maxScale: (): number => currentMaxScale(),
        canZoomIn: (): boolean => canZoomInScale(scale, currentMaxScale()),
        canZoomOut: (): boolean => canZoomOutScale(scale),
        isZoomed: (): boolean => canZoomOutScale(scale),
        isDragging: (): boolean => dragging,
        isSettling: (): boolean => settling,
        percentLabel: (): string => formatZoomPercent(scale),
        transformStyle: (): string => `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
        zoomIn(origin?: MediaPoint | null): void {
            setScaleToward(stepScale(scale, "in", currentMaxScale()), origin)
        },
        zoomOut(origin?: MediaPoint | null): void {
            setScaleToward(stepScale(scale, "out", currentMaxScale()), origin)
        },
        toggleZoom(origin?: MediaPoint | null): void {
            if (canZoomInScale(scale, currentMaxScale())) setScaleToward(currentMaxScale(), origin)
            else {
                stopSettle()
                clearMotionSamples()
                applyState(resetZoom())
            }
        },
        reset(): void {
            stopSettle()
            clearMotionSamples()
            applyState(resetZoom())
        },
        cancelSettle(): void {
            stopSettle()
            clearMotionSamples()
        },
        setNaturalSize(width: number, _height: number): void {
            let next = width > 0 ? width : 0
            if (next === naturalWidth) return
            naturalWidth = next
            setScaleToward(scale, null)
        },
        setLayoutSize(width: number, height: number): void {
            let nextW = width > 0 ? width : 0
            let nextH = height > 0 ? height : 0
            if (nextW === layoutWidth && nextH === layoutHeight) return
            layoutWidth = nextW
            layoutHeight = nextH
            setScaleToward(scale, null)
        },
        setViewportSize(width: number, height: number): void {
            let nextW = width > 0 ? width : 0
            let nextH = height > 0 ? height : 0
            if (nextW === viewportWidth && nextH === viewportHeight) return
            viewportWidth = nextW
            viewportHeight = nextH
            setScaleToward(scale, null)
        },
        applyWheel(deltaY: number, origin?: MediaPoint | null): void {
            let amount = wheelZoomAmount(deltaY)
            if (amount !== 0) setScaleToward(scaleByRelativeAmount(scale, amount, currentMaxScale()), origin)
        },
        applyRelativeZoom(amount: number, origin?: MediaPoint | null): void {
            if (amount) setScaleToward(scaleByRelativeAmount(scale, amount, currentMaxScale()), origin)
        },
        /**
         * Multi-touch pinch zoom with soft min/max overshoot.
         * Hard clamp is restored on `endDrag({ pinchOrigin })`.
         */
        applyRelativeZoomSoft(amount: number, origin?: MediaPoint | null): void {
            if (!amount) return
            let soft = softScaleLimits(MEDIA_MIN_SCALE, currentMaxScale())
            let nextScale = scale * (1 + amount)
            setScaleToward(nextScale, origin, soft.min, soft.max)
        },
        beginDrag(): void {
            stopSettle()
            dragging = true
            clearMotionSamples()
            noteMotionSample()
        },
        moveDrag(deltaX: number, deltaY: number, startTranslateX: number, startTranslateY: number): void {
            let next = zoomAtOrigin(
                { scale, translateX: startTranslateX + deltaX, translateY: startTranslateY + deltaY },
                scale,
                null,
                layoutWidth,
                layoutHeight,
                viewportWidth,
                viewportHeight,
                MEDIA_MIN_SCALE,
                currentMaxScale(),
            )
            translateX = next.translateX
            translateY = next.translateY
            noteMotionSample()
        },
        /** Relative pan (e.g. trackpad two-finger scroll when zoomed). No inertia. */
        panBy(deltaX: number, deltaY: number): void {
            if (!canZoomOutScale(scale) || (!deltaX && !deltaY)) return
            stopSettle()
            let next = zoomAtOrigin(
                { scale, translateX: translateX + deltaX, translateY: translateY + deltaY },
                scale,
                null,
                layoutWidth,
                layoutHeight,
                viewportWidth,
                viewportHeight,
                MEDIA_MIN_SCALE,
                currentMaxScale(),
            )
            translateX = next.translateX
            translateY = next.translateY
        },
        endDrag(endOpts?: { withInertia?: boolean; pinchOrigin?: MediaPoint | null }): void {
            dragging = false
            settleAfterRelease(endOpts)
        },
        getDragStartTranslate(): { translateX: number; translateY: number } {
            return { translateX, translateY }
        },
        destroy(): void {
            stopSettle()
            clearMotionSamples()
            dragging = false
            applyState(resetZoom())
        },
    }
}
