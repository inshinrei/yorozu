export const MENU_VIEW_MARGIN_PX: number = 16
export const MENU_POINTER_NUDGE_PX: number = 3
export const MENU_MAX_HEIGHT_BOTTOM_MARGIN_PX: number = 12

export type MenuPositionX = "left" | "right"
export type MenuPositionY = "top" | "bottom"

export type PlaceFixedMenuInput = {
    anchorX: number
    anchorY: number
    menuWidth: number
    menuHeight: number
    viewportWidth: number
    viewportHeight: number
    margin?: number
    extraMinWidth?: number
    extraTopSpace?: number
    extraPaddingX?: number
    withMaxHeight?: boolean
}

export type PlaceFixedMenuResult = {
    left: number
    top: number
    positionX: MenuPositionX
    positionY: MenuPositionY
    originX: number
    originY: number
    origin: string
    maxHeight: number | undefined
}

function clamp(n: number, min: number, max: number): number {
    if (max < min) return min
    return Math.min(Math.max(n, min), max)
}

export function placeFixedMenu(input: PlaceFixedMenuInput): PlaceFixedMenuResult {
    let margin = input.margin ?? MENU_VIEW_MARGIN_PX
    let extraMinWidth = input.extraMinWidth ?? 0
    let extraTopSpace = input.extraTopSpace ?? 0
    let extraPaddingX = input.extraPaddingX ?? 0
    let width = Math.max(input.menuWidth, extraMinWidth)
    let height = input.menuHeight

    let positionX: MenuPositionX
    if (input.anchorX + width + extraPaddingX < input.viewportWidth) {
        positionX = "left"
    } else if (input.anchorX - width > 0) {
        positionX = "right"
    } else {
        positionX = "left"
    }

    let positionY: MenuPositionY = input.anchorY + height < input.viewportHeight ? "top" : "bottom"

    let left = positionX === "left" ? input.anchorX + MENU_POINTER_NUDGE_PX : input.anchorX - width
    let top = positionY === "top" ? input.anchorY : input.anchorY - height

    left = clamp(left, margin, input.viewportWidth - width - margin)
    top = clamp(top, margin + extraTopSpace, input.viewportHeight - height - margin)

    let originX = input.anchorX - left
    let originY = input.anchorY - top
    let origin = `${originX}px ${originY}px`
    let maxHeight = input.withMaxHeight
        ? Math.max(0, input.viewportHeight - MENU_MAX_HEIGHT_BOTTOM_MARGIN_PX)
        : undefined

    return {
        left,
        top,
        positionX,
        positionY,
        originX,
        originY,
        origin,
        maxHeight,
    }
}
