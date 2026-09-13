/**
 * Pure zoom/pan math for media photo stage.
 * Scale 1 = fit-to-viewport; max is MEDIA_MAX_ZOOM_FACTOR × fit (digital zoom past native OK).
 */

import { boundTranslate, clampScale, zoomAtOrigin } from "@yorozu/animations"

export const MEDIA_MIN_SCALE: number = 1
/** Max scale relative to fit-to-viewport (allows oversampling past natural pixels). */
export const MEDIA_MAX_ZOOM_FACTOR: number = 20
/** Multiplicative step for toolbar / keyboard zoom. */
export const MEDIA_ZOOM_STEP: number = 1.25
/**
 * Wheel delta divisor — lower = faster.
 * Typical trackpad line ≈ 1–20; mouse notch ≈ 100+.
 */
export const MEDIA_WHEEL_DELTA_SCALE: number = 90
/** Cap relative zoom amount per wheel event so mouse notches don't jump too hard. */
export const MEDIA_WHEEL_AMOUNT_MAX: number = 0.55
/**
 * Idle after last ctrl/meta wheel zoom sample before legalize settle (ms).
 * Pointer pinch legalizes on release instead.
 */
export const MEDIA_WHEEL_ZOOM_RELEASE_MS: number = 150

/**
 * Trackpad two-finger pan multiplier (1 = raw wheel pixels; higher = snappier pan).
 * Raw deltas feel sluggish once the image is large under high zoom.
 */
export const MEDIA_WHEEL_PAN_SENSITIVITY: number = 2.75
/**
 * Extra gain for faster flicks: effective = sens * (1 + ACCEL * min(1, speed/ref)).
 * Keeps small nudges controllable while making quick two-finger swipes cover more ground.
 */
export const MEDIA_WHEEL_PAN_FLICK_ACCEL: number = 0.85
export const MEDIA_WHEEL_PAN_FLICK_REF_PX: number = 28

/**
 * Effective coast time (ms): extra pan ≈ velocity × coastMs.
 * Tuned for a short fling that still reaches an edge on large images.
 */
export const MEDIA_PAN_INERTIA_COAST_MS: number = 180
/** Hard cap on coast distance so a wild flick cannot fly across the whole photo. */
export const MEDIA_PAN_INERTIA_MAX_COAST_PX: number = 1400
/** Ignore slower-than-this speeds (px/ms) so a careful release does not creep. */
export const MEDIA_PAN_INERTIA_MIN_SPEED_PX_MS: number = 0.08
/** Look-back window for velocity samples (ms). */
export const MEDIA_PAN_INERTIA_SAMPLE_WINDOW_MS: number = 80
/** Cap settle animation (matches swipe settle ceiling). */
export const MEDIA_ZOOM_SETTLE_MS: number = 350
export const MEDIA_ZOOM_SETTLE_MS_MIN: number = 160
/**
 * Soft scale overshoot during multi-touch pinch only (relative to hard min/max).
 * Pinch may undershoot to 0.2× fit and overshoot max by 1.15×, then legalize.
 */
export const MEDIA_SOFT_SCALE_MIN_FACTOR: number = 0.2
export const MEDIA_SOFT_SCALE_MAX_FACTOR: number = 1.15

/** Offset from displayed image center (client coords). */
export type MediaPoint = { offsetX: number; offsetY: number }
export type MediaZoomState = { scale: number; translateX: number; translateY: number }
/** Velocity of pan translate in CSS px per ms. */
export type MediaZoomVelocity = { vx: number; vy: number }
/** Timestamped translate sample for velocity estimation. */
export type MediaZoomSample = { t: number; x: number; y: number }

/**
 * Max scale relative to fit size. Always allows up to `maxFactor` (digital zoom),
 * not limited by natural pixel size.
 * `layoutWidth` / `naturalWidth` kept for API stability / future crisp indicators.
 */
export function maxScaleFromNatural(
    _layoutWidth: number,
    _naturalWidth: number,
    maxFactor: number = MEDIA_MAX_ZOOM_FACTOR,
): number {
    if (!(maxFactor > MEDIA_MIN_SCALE)) return MEDIA_MIN_SCALE
    return maxFactor
}

export function canZoomIn(scale: number, maxScale: number, epsilon: number = 0.001): boolean {
    return scale < maxScale - epsilon
}

export function canZoomOut(scale: number, minScale: number = MEDIA_MIN_SCALE, epsilon: number = 0.001): boolean {
    return scale > minScale + epsilon
}

/** Next scale after a toolbar/keyboard step. */
export function stepScale(
    scale: number,
    direction: "in" | "out",
    maxScale: number,
    step: number = MEDIA_ZOOM_STEP,
): number {
    let next = direction === "in" ? scale * step : scale / step
    return clampScale(next, MEDIA_MIN_SCALE, maxScale)
}

function boundTranslateState(
    state: MediaZoomState,
    layoutW: number,
    layoutH: number,
    viewportW: number,
    viewportH: number,
): MediaZoomState {
    let bounded = boundTranslate(
        state.translateX,
        state.translateY,
        state.scale,
        layoutW,
        layoutH,
        viewportW,
        viewportH,
    )
    return { scale: state.scale, translateX: bounded.translateX, translateY: bounded.translateY }
}

export function resetZoom(): MediaZoomState {
    return { scale: MEDIA_MIN_SCALE, translateX: 0, translateY: 0 }
}

/** Whole-percent label for a11y live region / optional chrome. */
export function formatZoomPercent(scale: number): string {
    let pct = Math.round(scale * 100)
    if (!Number.isFinite(pct) || pct < 100) pct = 100
    return `${pct}%`
}

/**
 * Relative zoom amount from wheel deltaY (positive → zoom in).
 */
export function wheelZoomAmount(deltaY: number, deltaScale: number = MEDIA_WHEEL_DELTA_SCALE): number {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0
    let amount = deltaY / -deltaScale
    if (amount > MEDIA_WHEEL_AMOUNT_MAX) return MEDIA_WHEEL_AMOUNT_MAX
    if (amount < -MEDIA_WHEEL_AMOUNT_MAX) return -MEDIA_WHEEL_AMOUNT_MAX
    return amount
}

/** Apply relative amount: newScale = scale * (1 + amount), clamped. */
export function scaleByRelativeAmount(scale: number, amount: number, maxScale: number): number {
    if (!Number.isFinite(amount) || amount === 0) return scale
    return clampScale(scale * (1 + amount), MEDIA_MIN_SCALE, maxScale)
}

/**
 * Normalize wheel deltas to CSS pixels (deltaMode: 0=pixel, 1=line, 2=page)
 * and apply pan sensitivity / flick acceleration for trackpad two-finger pan.
 */
export function wheelPanDeltas(
    deltaX: number,
    deltaY: number,
    deltaMode: number,
    lineHeight: number = 16,
    pageHeight: number = 800,
    sensitivity: number = MEDIA_WHEEL_PAN_SENSITIVITY,
): { deltaX: number; deltaY: number } {
    let modeScale = 1
    if (deltaMode === 1) modeScale = lineHeight
    else if (deltaMode === 2) modeScale = pageHeight
    let rawX = (Number.isFinite(deltaX) ? deltaX : 0) * modeScale
    let rawY = (Number.isFinite(deltaY) ? deltaY : 0) * modeScale
    let speed = Math.hypot(rawX, rawY)
    let flick = Math.min(1, speed / MEDIA_WHEEL_PAN_FLICK_REF_PX)
    let gain = sensitivity * (1 + MEDIA_WHEEL_PAN_FLICK_ACCEL * flick)
    return {
        deltaX: rawX * gain,
        deltaY: rawY * gain,
    }
}

/**
 * Wheel intent:
 * - pinch / ctrl+wheel → zoom
 * - two-finger scroll when zoomed → pan
 * - two-finger scroll when unzoomed → swipe (nav / dismiss; handled outside zoom stage)
 */
export function wheelIntent(isZoomed: boolean, ctrlOrMeta: boolean): "zoom" | "pan" | "swipe" {
    if (ctrlOrMeta) return "zoom"
    if (isZoomed) return "pan"
    return "swipe"
}

/**
 * Settle duration scales with remaining motion so a short coast is snappy
 * and a long fling eases out up to {@link MEDIA_ZOOM_SETTLE_MS}.
 */
export function zoomSettleDurationMs(remainingPx: number, refPx: number = 600): number {
    let ref = refPx > 0 ? refPx : 600
    let t = Math.min(1, Math.abs(remainingPx) / ref)
    return Math.round(MEDIA_ZOOM_SETTLE_MS_MIN + t * (MEDIA_ZOOM_SETTLE_MS - MEDIA_ZOOM_SETTLE_MS_MIN))
}

/**
 * Soft min/max for live pinch and ctrl/meta wheel. Toolbar / keyboard keep hard clamp.
 */
export function softScaleLimits(
    minScale: number = MEDIA_MIN_SCALE,
    maxScale: number = MEDIA_MAX_ZOOM_FACTOR,
): { min: number; max: number } {
    let hardMin = minScale > 0 ? minScale : MEDIA_MIN_SCALE
    let hardMax = maxScale > hardMin ? maxScale : hardMin
    return {
        min: hardMin * MEDIA_SOFT_SCALE_MIN_FACTOR,
        max: hardMax * MEDIA_SOFT_SCALE_MAX_FACTOR,
    }
}

/**
 * Estimate pan velocity (px/ms) from recent translate samples.
 * Uses first sample inside the window vs latest for a stable average.
 */
export function velocityFromSamples(
    samples: readonly MediaZoomSample[],
    now: number,
    windowMs: number = MEDIA_PAN_INERTIA_SAMPLE_WINDOW_MS,
): MediaZoomVelocity {
    if (!samples.length) return { vx: 0, vy: 0 }
    let latest = samples[samples.length - 1]!
    let oldest = latest
    let cutoff = now - windowMs
    for (let i = samples.length - 2; i >= 0; i--) {
        let s = samples[i]!
        if (s.t < cutoff) break
        oldest = s
    }
    let dt = latest.t - oldest.t
    if (!(dt > 0)) return { vx: 0, vy: 0 }
    return {
        vx: (latest.x - oldest.x) / dt,
        vy: (latest.y - oldest.y) / dt,
    }
}

/**
 * Project a coast target from current state + velocity, then hard-bound pan.
 * Zero / sub-threshold speed returns the bounded current state (no coast).
 */
export function projectPanInertia(
    state: MediaZoomState,
    velocity: MediaZoomVelocity,
    layoutW: number,
    layoutH: number,
    viewportW: number,
    viewportH: number,
    coastMs: number = MEDIA_PAN_INERTIA_COAST_MS,
    maxCoastPx: number = MEDIA_PAN_INERTIA_MAX_COAST_PX,
    minSpeed: number = MEDIA_PAN_INERTIA_MIN_SPEED_PX_MS,
): MediaZoomState {
    let speed = Math.hypot(velocity.vx, velocity.vy)
    if (!(speed >= minSpeed) || !(coastMs > 0)) {
        return boundTranslateState(state, layoutW, layoutH, viewportW, viewportH)
    }
    let dx = velocity.vx * coastMs
    let dy = velocity.vy * coastMs
    let dist = Math.hypot(dx, dy)
    if (dist > maxCoastPx && dist > 0) {
        let k = maxCoastPx / dist
        dx *= k
        dy *= k
    }
    return boundTranslateState(
        {
            scale: state.scale,
            translateX: state.translateX + dx,
            translateY: state.translateY + dy,
        },
        layoutW,
        layoutH,
        viewportW,
        viewportH,
    )
}

/**
 * Snap scale into hard [min, max] while preserving zoom origin, then bound pan.
 * Used after pinch soft-overshoot release.
 */
export function legalizeZoomState(
    state: MediaZoomState,
    origin: MediaPoint | null | undefined,
    layoutW: number,
    layoutH: number,
    viewportW: number,
    viewportH: number,
    minScale: number = MEDIA_MIN_SCALE,
    maxScale: number = MEDIA_MAX_ZOOM_FACTOR,
): MediaZoomState {
    let legalScale = clampScale(state.scale, minScale, maxScale)
    if (legalScale === state.scale) {
        return boundTranslateState(state, layoutW, layoutH, viewportW, viewportH)
    }
    return zoomAtOrigin(state, legalScale, origin, layoutW, layoutH, viewportW, viewportH, minScale, maxScale)
}

/** Euclidean residual between two zoom states (for settle duration). */
export function zoomStateDistance(from: MediaZoomState, to: MediaZoomState, layoutW: number, layoutH: number): number {
    let dx = to.translateX - from.translateX
    let dy = to.translateY - from.translateY
    // Scale delta as approx pan of a corner so mixed settle feels similar.
    let ref = Math.max(layoutW, layoutH, 1)
    let ds = (to.scale - from.scale) * ref * 0.5
    return Math.hypot(dx, dy, ds)
}

/** Linear interpolate zoom channels (t already eased). */
export function lerpZoomState(from: MediaZoomState, to: MediaZoomState, t: number): MediaZoomState {
    let u = t < 0 ? 0 : t > 1 ? 1 : t
    return {
        scale: from.scale + (to.scale - from.scale) * u,
        translateX: from.translateX + (to.translateX - from.translateX) * u,
        translateY: from.translateY + (to.translateY - from.translateY) * u,
    }
}

/** True when states are visually equal (stable float compare). */
export function zoomStatesNearlyEqual(a: MediaZoomState, b: MediaZoomState, epsilon: number = 0.05): boolean {
    return (
        Math.abs(a.scale - b.scale) < epsilon * 0.01 &&
        Math.abs(a.translateX - b.translateX) < epsilon &&
        Math.abs(a.translateY - b.translateY) < epsilon
    )
}
