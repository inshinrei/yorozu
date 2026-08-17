import type { Insets, Rect, Size } from "./types"

/** Fit natural size into box without upscaling past natural (CSS contain-like). */
export function fitContain(natural: Size, box: Size): Size | null {
    let natW = natural.width
    let natH = natural.height
    let boxW = box.width
    let boxH = box.height
    if (!(natW > 0) || !(natH > 0) || !(boxW > 0) || !(boxH > 0)) return null
    let scale = Math.min(boxW / natW, boxH / natH, 1)
    return {
        width: Math.max(1, Math.round(natW * scale)),
        height: Math.max(1, Math.round(natH * scale)),
    }
}

/** Center a fitted size inside a padded viewport. */
export function centerFitInViewport(fit: Size, viewport: Size, insets: Insets): Rect {
    let availW = Math.max(0, viewport.width - insets.left - insets.right)
    let availH = Math.max(0, viewport.height - insets.top - insets.bottom)
    return {
        top: insets.top + (availH - fit.height) / 2,
        left: insets.left + (availW - fit.width) / 2,
        width: fit.width,
        height: fit.height,
    }
}
