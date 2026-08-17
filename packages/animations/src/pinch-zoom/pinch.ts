import { applyStyles } from "../core/styles"
import type { Size } from "../rect/types"
import {
    boundTranslate,
    clampScale,
    nextScaleFromWheel,
    PINCH_MAX_SCALE,
    PINCH_MIN_SCALE,
    resetZoom,
    zoomAtOrigin,
    zoomTransform,
    type ZoomState,
} from "./math"

export type { Point, Translate, ZoomState } from "./math"
export {
    PINCH_MAX_SCALE,
    PINCH_MIN_SCALE,
    PINCH_WHEEL_FACTOR,
    boundTranslate,
    clampScale,
    maxTranslate,
    nextScaleFromWheel,
    resetZoom,
    zoomAtOrigin,
    zoomTransform,
} from "./math"

export type PinchZoomConfig = {
    getEl: () => HTMLElement | null
    getLayout: () => Size
    getViewport: () => Size
}

export type PinchZoom = {
    setState: (next: ZoomState) => ZoomState
    reset: () => ZoomState
    destroy: () => void
}

function applyState(el: HTMLElement, state: ZoomState): void {
    applyStyles(el, {
        transform: zoomTransform(state),
        "transform-origin": "0 0",
    })
}

export function createPinchZoom(config: PinchZoomConfig): PinchZoom {
    let state: ZoomState = resetZoom()
    let el = config.getEl()

    let sizes = (): { layout: Size; viewport: Size } => ({
        layout: config.getLayout(),
        viewport: config.getViewport(),
    })

    let commit = (next: ZoomState): ZoomState => {
        let { layout, viewport } = sizes()
        let scale = clampScale(next.scale, PINCH_MIN_SCALE, PINCH_MAX_SCALE)
        let bounded = boundTranslate(next.translateX, next.translateY, scale, layout.width, layout.height, viewport.width, viewport.height)
        state = { scale, translateX: bounded.translateX, translateY: bounded.translateY }
        let node = config.getEl()
        if (node) applyState(node, state)
        return state
    }

    let onWheel = (event: WheelEvent): void => {
        let node = config.getEl()
        if (!node) return
        let { layout, viewport } = sizes()
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            state = zoomAtOrigin(
                state,
                nextScaleFromWheel(state.scale, event.deltaY),
                { offsetX: event.offsetX, offsetY: event.offsetY },
                layout.width,
                layout.height,
                viewport.width,
                viewport.height,
            )
            applyState(node, state)
            return
        }
        if (state.scale <= 1) return
        event.preventDefault()
        let pan = boundTranslate(
            state.translateX - event.deltaX,
            state.translateY - event.deltaY,
            state.scale,
            layout.width,
            layout.height,
            viewport.width,
            viewport.height,
        )
        state = { scale: state.scale, translateX: pan.translateX, translateY: pan.translateY }
        applyState(node, state)
    }

    if (el) el.addEventListener("wheel", onWheel, { passive: false })

    return {
        setState: (next) => commit(next),
        reset: () => commit(resetZoom()),
        destroy: () => {
            if (el) el.removeEventListener("wheel", onWheel)
            el = null
        },
    }
}
