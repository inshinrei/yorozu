export const PINCH_MIN_SCALE: number = 1
export const PINCH_MAX_SCALE: number = 20
export const PINCH_WHEEL_FACTOR: number = 0.01

export type Point = { offsetX: number; offsetY: number }
export type Translate = { translateX: number; translateY: number }
export type ZoomState = Translate & { scale: number }

export function clampScale(scale: number, min: number, max: number): number {
    if (!Number.isFinite(scale)) return min
    if (scale < min) return min
    if (scale > max) return max
    return scale
}

function clampNumber(value: number, min: number, max: number): number {
    let next = value
    if (next < min) next = min
    if (next > max) next = max
    return next === 0 ? 0 : next
}

export function maxTranslate(
    scale: number,
    layoutW: number,
    layoutH: number,
    viewportW: number,
    viewportH: number,
): Translate {
    return {
        translateX: Math.max(0, (layoutW * scale - viewportW) / 2),
        translateY: Math.max(0, (layoutH * scale - viewportH) / 2),
    }
}

export function boundTranslate(
    translateX: number,
    translateY: number,
    scale: number,
    layoutW: number,
    layoutH: number,
    viewportW: number,
    viewportH: number,
): Translate {
    let bounds = maxTranslate(scale, layoutW, layoutH, viewportW, viewportH)
    return {
        translateX: clampNumber(translateX, -bounds.translateX, bounds.translateX),
        translateY: clampNumber(translateY, -bounds.translateY, bounds.translateY),
    }
}

function boundState(
    state: ZoomState,
    layoutW: number,
    layoutH: number,
    viewportW: number,
    viewportH: number,
): ZoomState {
    let bounded = boundTranslate(state.translateX, state.translateY, state.scale, layoutW, layoutH, viewportW, viewportH)
    return { scale: state.scale, translateX: bounded.translateX, translateY: bounded.translateY }
}

export function zoomAtOrigin(
    state: ZoomState,
    nextScale: number,
    origin: Point | null | undefined,
    layoutW: number,
    layoutH: number,
    viewportW: number,
    viewportH: number,
    minScale: number = PINCH_MIN_SCALE,
    maxScale: number = PINCH_MAX_SCALE,
): ZoomState {
    let scale = clampScale(nextScale, minScale, maxScale)
    if (scale === state.scale) return boundState(state, layoutW, layoutH, viewportW, viewportH)
    let originX = origin?.offsetX ?? 0
    let originY = origin?.offsetY ?? 0
    let ratio = scale / state.scale
    return boundState(
        {
            scale,
            translateX: state.translateX + originX * (1 - ratio),
            translateY: state.translateY + originY * (1 - ratio),
        },
        layoutW,
        layoutH,
        viewportW,
        viewportH,
    )
}

export function resetZoom(): ZoomState {
    return { scale: PINCH_MIN_SCALE, translateX: 0, translateY: 0 }
}

export function zoomTransform(state: ZoomState): string {
    return `translate3d(${state.translateX}px, ${state.translateY}px, 0) scale(${state.scale})`
}

export function nextScaleFromWheel(
    scale: number,
    deltaY: number,
    minScale: number = PINCH_MIN_SCALE,
    maxScale: number = PINCH_MAX_SCALE,
): number {
    return clampScale(scale * Math.exp(-deltaY * PINCH_WHEEL_FACTOR), minScale, maxScale)
}
