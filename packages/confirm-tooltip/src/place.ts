import { MENU_VIEW_MARGIN_PX } from "@yorozu/context-menu"

export const CONFIRM_TOOLTIP_VIEW_MARGIN_PX: number = MENU_VIEW_MARGIN_PX

export type PlaceConfirmTooltipInput = {
    anchorX: number
    anchorY: number
    width: number
    height: number
    viewportWidth: number
    viewportHeight: number
    margin?: number
}

export type PlaceConfirmTooltipResult = {
    left: number
    top: number
    originX: number
    originY: number
    origin: string
}

function clamp(n: number, min: number, max: number): number {
    if (max < min) return min
    return Math.min(max, Math.max(min, n))
}

export function placeConfirmTooltip(input: PlaceConfirmTooltipInput): PlaceConfirmTooltipResult {
    let margin = input.margin ?? CONFIRM_TOOLTIP_VIEW_MARGIN_PX
    let left = clamp(input.anchorX - input.width / 2, margin, input.viewportWidth - input.width - margin)
    let top = clamp(input.anchorY, margin, input.viewportHeight - input.height - margin)
    let originX = input.anchorX - left
    let originY = input.anchorY - top
    return { left, top, originX, originY, origin: `${originX}px ${originY}px` }
}
