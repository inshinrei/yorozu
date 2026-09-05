import {
    MENU_POINTER_NUDGE_PX,
    MENU_POPOVER_CLOSE_MS,
    MENU_POPOVER_OPEN_MS,
    MENU_POPOVER_SCALE,
    createMenuPopover,
} from "@yorozu/context-menu"
import type { ConfirmAnchor } from "./anchor"
import { CONFIRM_TOOLTIP_HISTORY_STATE, CONFIRM_TOOLTIP_PENDING_HISTORY_KEYS, bindHistoryWhenIdle } from "./history"
import { placeConfirmTooltip } from "./place"

export const CONFIRM_TOOLTIP_OPEN_MS: number = MENU_POPOVER_OPEN_MS
export const CONFIRM_TOOLTIP_CLOSE_MS: number = MENU_POPOVER_CLOSE_MS
export const CONFIRM_TOOLTIP_SCALE: number = MENU_POPOVER_SCALE
export const CONFIRM_TOOLTIP_POINTER_NUDGE_PX: number = MENU_POINTER_NUDGE_PX
export const CONFIRM_TOOLTIP_INSIDE_SELECTOR: string = "[data-yorozu-confirm]"

export type ConfirmTooltipSessionOpts = {
    onClose: () => void
    getDurationMs?: (kind: "open" | "close") => number
    listenEsc?: boolean
    insideSelector?: string
    historyState?: Record<string, unknown>
    pendingHistoryKeys?: readonly string[]
    canClose?: () => boolean
}

export type ConfirmTooltipSession = {
    attach: (el: HTMLElement) => void
    place: (anchor: ConfirmAnchor) => void
    close: () => void
    destroy: () => void
}

export function createConfirmTooltipSession(opts: ConfirmTooltipSessionOpts): ConfirmTooltipSession {
    let popover = createMenuPopover()
    let el: HTMLElement | null = null
    let closing = false
    let currentPlayback: ReturnType<typeof popover.playOpen> | null = null
    let rafId: number | null = null
    let historyLayer: ReturnType<typeof bindHistoryWhenIdle> | null = null
    let insideSelector = opts.insideSelector ?? CONFIRM_TOOLTIP_INSIDE_SELECTOR
    let historyState = opts.historyState ?? CONFIRM_TOOLTIP_HISTORY_STATE
    let pendingKeys = [
        ...new Set([
            ...CONFIRM_TOOLTIP_PENDING_HISTORY_KEYS,
            ...Object.keys(historyState),
            ...(opts.pendingHistoryKeys ?? []),
        ]),
    ]

    function durationFor(kind: "open" | "close"): number {
        let d = opts.getDurationMs?.(kind)
        if (d === 0) return 0
        if (typeof d === "number" && d > 0) return d
        return kind === "open" ? CONFIRM_TOOLTIP_OPEN_MS : CONFIRM_TOOLTIP_CLOSE_MS
    }

    function canDismiss(): boolean {
        return opts.canClose?.() ?? true
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

    function bindHistory(): void {
        historyLayer?.release()
        historyLayer = bindHistoryWhenIdle({
            onBack: onHistoryBack,
            state: historyState,
            pendingKeys,
        })
    }

    function onHistoryBack(): void {
        if (!canDismiss()) {
            bindHistory()
            return
        }
        close()
    }

    function playOpen(origin: string): void {
        if (el == null) return
        currentPlayback = popover.playOpen(el, {
            origin,
            durationMs: durationFor("open"),
        })
        el.focus({ preventScroll: true })
    }

    function applyPlace(anchor: ConfirmAnchor): void {
        if (el == null) return
        let placed = placeConfirmTooltip({
            anchorX: anchor.x,
            anchorY: anchor.y,
            width: el.offsetWidth,
            height: el.offsetHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        })
        el.style.left = `${placed.left}px`
        el.style.top = `${placed.top}px`
        el.style.right = "unset"
        el.style.bottom = "unset"
        playOpen(placed.origin)
    }

    function close(): void {
        if (closing) return
        closing = true
        cancelRaf()
        if (el == null) {
            finishClose()
            opts.onClose()
            return
        }
        let playback = popover.playClose(el, {
            durationMs: durationFor("close"),
        })
        currentPlayback = playback
        void playback.done.then((ran) => {
            if (!ran || !closing || currentPlayback !== playback) return
            finishClose()
            opts.onClose()
        })
    }

    function requestClose(): void {
        if (!canDismiss()) return
        close()
    }

    function onPointerDown(event: PointerEvent): void {
        if (closing) return
        if ((event.target as Element | null)?.closest?.(insideSelector)) return
        requestClose()
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") requestClose()
    }

    function unbindDocument(): void {
        document.removeEventListener("pointerdown", onPointerDown, false)
        document.removeEventListener("keydown", onKeyDown)
    }

    function attach(node: HTMLElement): void {
        if (el === node) return
        unbindDocument()
        el = node
        closing = false
        bindHistory()
        document.addEventListener("pointerdown", onPointerDown, false)
        if (opts.listenEsc === true) {
            document.addEventListener("keydown", onKeyDown)
        }
    }

    function place(anchor: ConfirmAnchor): void {
        resetClosing()
        cancelRaf()
        if (el == null) return
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
            rafId = requestAnimationFrame(() => {
                rafId = null
                applyPlace(anchor)
            })
            return
        }
        applyPlace(anchor)
    }

    function destroy(): void {
        currentPlayback?.cancel()
        currentPlayback = null
        cancelRaf()
        unbindDocument()
        historyLayer?.release()
        historyLayer = null
        el = null
        closing = false
    }

    return { attach, place, close, destroy }
}
