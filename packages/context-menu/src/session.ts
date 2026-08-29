import type { Playback } from "@yorozu/animations"
import { bindHistoryLayer, type HistoryLayer } from "./history"
import type { AboveAnchorPlacement } from "./place-above"
import { placeFixedMenu } from "./place-fixed"
import {
    MENU_POPOVER_CLOSE_EASING,
    MENU_POPOVER_CLOSE_MS,
    MENU_POPOVER_OPEN_EASING,
    MENU_POPOVER_OPEN_MS,
    createMenuPopover,
} from "./popover"

export type PlacePointerOpts = {
    extraMinWidth?: number
    extraTopSpace?: number
    extraPaddingX?: number
    withMaxHeight?: boolean
    margin?: number
    applyMaxHeightStyle?: boolean
}

export type MenuSessionOpts = {
    onClose: () => void
    getDurationMs?: (kind: "open" | "close") => number
    nested?: boolean
    listenEsc?: boolean
    insideSelector?: string
    historyState?: Record<string, unknown>
}

export type MenuSession = {
    attach: (el: HTMLElement) => void
    placePointer: (anchor: { x: number; y: number }, opts?: PlacePointerOpts) => void
    placeAbove: (placed: AboveAnchorPlacement) => void
    close: () => void
    destroy: () => void
}

export function createMenuSession(opts: MenuSessionOpts): MenuSession {
    let popover = createMenuPopover()
    let el: HTMLElement | null = null
    let closing = false
    let currentPlayback: Playback | null = null
    let rafId: number | null = null
    let historyLayer: HistoryLayer | null = null
    let insideSelector = opts.insideSelector ?? "[data-yorozu-menu]"

    function durationFor(kind: "open" | "close"): number {
        let d = opts.getDurationMs?.(kind)
        if (d === 0) return 0
        if (typeof d === "number" && d > 0) return d
        return kind === "open" ? MENU_POPOVER_OPEN_MS : MENU_POPOVER_CLOSE_MS
    }

    function cancelRaf(): void {
        if (rafId == null) return
        cancelAnimationFrame(rafId)
        rafId = null
    }

    function resetClosing(): void {
        if (!closing) return
        currentPlayback?.cancel()
        currentPlayback = null
        closing = false
    }

    function finishClose(): void {
        historyLayer?.release()
        historyLayer = null
    }

    function playOpen(origin: string): void {
        if (el == null) return
        currentPlayback = popover.playOpen(el, {
            origin,
            durationMs: durationFor("open"),
            easing: MENU_POPOVER_OPEN_EASING,
        })
        el.focus({ preventScroll: true })
    }

    function applyPointer(anchor: { x: number; y: number }, placeOpts?: PlacePointerOpts): void {
        if (el == null) return
        let placed = placeFixedMenu({
            anchorX: anchor.x,
            anchorY: anchor.y,
            menuWidth: el.offsetWidth,
            menuHeight: el.offsetHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            margin: placeOpts?.margin,
            extraMinWidth: placeOpts?.extraMinWidth,
            extraTopSpace: placeOpts?.extraTopSpace,
            extraPaddingX: placeOpts?.extraPaddingX,
            withMaxHeight: placeOpts?.withMaxHeight,
        })
        el.style.left = `${placed.left}px`
        el.style.top = `${placed.top}px`
        el.style.right = "unset"
        el.style.bottom = "unset"
        if (placed.maxHeight != null) {
            el.style.setProperty("--yorozu-menu-max-height", `${placed.maxHeight}px`)
            if (placeOpts?.applyMaxHeightStyle !== false) {
                el.style.maxHeight = `${placed.maxHeight}px`
                el.style.overflow = "auto"
            }
        }
        playOpen(placed.origin)
    }

    function close(): void {
        if (closing) return
        closing = true
        cancelRaf()
        if (el == null) {
            finishClose()
            return
        }
        currentPlayback = popover.playClose(el, {
            durationMs: durationFor("close"),
            easing: MENU_POPOVER_CLOSE_EASING,
        })
        void currentPlayback.done.then((ran) => {
            if (!ran) return
            finishClose()
            opts.onClose()
        })
    }

    function onPointerDown(event: PointerEvent): void {
        if (closing) return
        if ((event.target as Element | null)?.closest?.(insideSelector)) return
        close()
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") close()
    }

    function attach(node: HTMLElement): void {
        el = node
        if (!opts.nested) {
            historyLayer = bindHistoryLayer({ onBack: close, state: opts.historyState })
        }
        document.addEventListener("pointerdown", onPointerDown, false)
        if (opts.listenEsc !== false) {
            document.addEventListener("keydown", onKeyDown)
        }
    }

    function placePointer(anchor: { x: number; y: number }, placeOpts?: PlacePointerOpts): void {
        resetClosing()
        cancelRaf()
        if (el == null) return
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
            rafId = requestAnimationFrame(() => {
                rafId = null
                applyPointer(anchor, placeOpts)
            })
            return
        }
        applyPointer(anchor, placeOpts)
    }

    function placeAbove(placed: AboveAnchorPlacement): void {
        resetClosing()
        cancelRaf()
        if (el == null) return
        el.style.bottom = `${placed.bottom}px`
        el.style.top = "unset"
        if (placed.left != null) {
            el.style.left = `${placed.left}px`
            el.style.right = "unset"
        } else {
            el.style.right = `${placed.right ?? 0}px`
            el.style.left = "unset"
        }
        playOpen(placed.origin)
    }

    function destroy(): void {
        currentPlayback?.cancel()
        currentPlayback = null
        cancelRaf()
        document.removeEventListener("pointerdown", onPointerDown, false)
        document.removeEventListener("keydown", onKeyDown)
        historyLayer?.release()
        historyLayer = null
        el = null
        closing = false
    }

    return { attach, placePointer, placeAbove, close, destroy }
}
