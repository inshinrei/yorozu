export const COMPOSER_MENU_GAP_PX: number = 8

export type MenuAlign = "start" | "end"

export type AnchorBox = {
    top: number
    left: number
    right: number
}

export type ViewportBox = {
    width: number
    height: number
}

export type AboveAnchorPlacement = {
    bottom: number
    left: number | undefined
    right: number | undefined
    origin: "bottom left" | "bottom right"
}

export function placeAboveAnchor(
    anchor: AnchorBox,
    align: MenuAlign,
    viewport?: ViewportBox,
    gapPx?: number,
): AboveAnchorPlacement {
    let vp = viewport ?? { width: window.innerWidth, height: window.innerHeight }
    let gap = gapPx ?? COMPOSER_MENU_GAP_PX
    let bottom = Math.max(0, vp.height - anchor.top + gap)

    if (align === "end") {
        return {
            bottom,
            left: undefined,
            right: Math.max(0, vp.width - anchor.right),
            origin: "bottom right",
        }
    }

    return {
        bottom,
        left: Math.max(0, anchor.left),
        right: undefined,
        origin: "bottom left",
    }
}
