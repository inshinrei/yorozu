import { createPopover, type Popover } from "@yorozu/animations"

export const MENU_POPOVER_OPEN_MS: number = 150
export const MENU_POPOVER_CLOSE_MS: number = 200
export const MENU_POPOVER_OPEN_EASING: string = "cubic-bezier(0.2, 0, 0.2, 1)"
export const MENU_POPOVER_CLOSE_EASING: string = "ease-in"
export const MENU_POPOVER_SCALE: number = 0.85

export function createMenuPopover(): Popover {
    let inner = createPopover({ scale: MENU_POPOVER_SCALE })
    return {
        playOpen: (el, options) =>
            inner.playOpen(el, {
                durationMs: MENU_POPOVER_OPEN_MS,
                easing: MENU_POPOVER_OPEN_EASING,
                ...options,
            }),
        playClose: (el, options) =>
            inner.playClose(el, {
                durationMs: MENU_POPOVER_CLOSE_MS,
                easing: MENU_POPOVER_CLOSE_EASING,
                ...options,
            }),
    }
}
