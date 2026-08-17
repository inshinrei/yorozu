import { animateElement, createPlayback } from "../core/playback"
import { dualRaf } from "../core/raf"
import { applyStyles, clearStyles } from "../core/styles"
import type { Playback } from "../core/types"
import {
    DOCK_EASING,
    DOCK_MS,
    dockTransforms,
    type DockEdge,
    type DockMode,
    type DockPanelState,
} from "./transforms"

export type { DockEdge, DockMode, DockPanelState, DockTransforms } from "./transforms"
export { DOCK_EASING, DOCK_FADE_OFFSET, DOCK_MS, dockTransforms } from "./transforms"

const PANEL_STYLE_KEYS: readonly string[] = ["transform", "opacity", "will-change"]
const BACKDROP_STYLE_KEYS: readonly string[] = ["opacity", "will-change"]

export type DockConfig = {
    getMode: () => DockMode
    edge?: DockEdge
    durationMs?: number
    easing?: string
}

export type DockHandle = {
    destroy: () => void
}

export type Dock = {
    readonly mounted: boolean
    readonly leaving: boolean
    readonly animating: boolean
    setOpen: (open: boolean) => Playback
    attach: (panel: HTMLElement) => DockHandle
    attachBackdrop: (el: HTMLElement) => DockHandle
    destroy: () => void
}

type Active = {
    opening: boolean
    mode: Exclude<DockMode, "none">
    playback: Playback
    resolve: (ran: boolean) => void
    isCancelled: () => boolean
    panelAnim: Animation | null
    backdropAnim: Animation | null
    started: boolean
}

export function createDock(config: DockConfig): Dock {
    let edge: DockEdge = config.edge ?? "right"
    let durationMs = config.durationMs ?? DOCK_MS
    let easing = config.easing ?? DOCK_EASING

    let mounted = false
    let leaving = false
    let animating = false
    let wantOpen = false
    let destroyed = false
    let panel: HTMLElement | null = null
    let backdrop: HTMLElement | null = null
    let active: Active | null = null

    let applyPanel = (el: HTMLElement, state: DockPanelState): void => {
        applyStyles(el, {
            transform: state.transform,
            opacity: state.opacity,
            "will-change": "transform, opacity",
        })
    }

    let clearPanel = (): void => {
        if (panel) clearStyles(panel, PANEL_STYLE_KEYS)
    }

    let clearBackdrop = (): void => {
        if (backdrop) clearStyles(backdrop, BACKDROP_STYLE_KEYS)
    }

    let abortActive = (): void => {
        if (!active) return
        active.panelAnim?.cancel()
        active.backdropAnim?.cancel()
        let resolve = active.resolve
        active = null
        resolve(false)
    }

    let settleInstant = (open: boolean): void => {
        wantOpen = open
        mounted = open
        leaving = false
        animating = false
        if (open) {
            if (backdrop) applyStyles(backdrop, { opacity: "1" })
            return
        }
        clearPanel()
        clearBackdrop()
    }

    let finish = (run: Active, ran: boolean): void => {
        if (active !== run) return
        active = null
        animating = false
        leaving = false
        if (wantOpen) {
            mounted = true
            if (panel) {
                applyPanel(panel, dockTransforms(run.mode, edge).open)
                clearStyles(panel, ["will-change"])
            }
            if (backdrop) {
                applyStyles(backdrop, { opacity: "1" })
                clearStyles(backdrop, ["will-change"])
            }
        } else {
            mounted = false
            clearPanel()
            clearBackdrop()
        }
        run.resolve(ran)
    }

    let animatePair = (run: Active): void => {
        let tx = dockTransforms(run.mode, edge)
        let from = run.opening ? tx.closed : tx.open
        let to = run.opening ? tx.open : tx.closed
        if (panel) {
            run.panelAnim = animateElement(panel, [from, to], {
                duration: durationMs,
                easing,
                fill: "forwards",
            })
        }
        if (backdrop) {
            run.backdropAnim = animateElement(
                backdrop,
                run.opening
                    ? [{ opacity: "0" }, { opacity: "1" }]
                    : [{ opacity: "1" }, { opacity: "0" }],
                { duration: durationMs, easing, fill: "forwards" },
            )
        }
        let waiter = run.panelAnim ?? run.backdropAnim
        if (!waiter) {
            finish(run, true)
            return
        }
        void waiter.finished.then(
            () => finish(run, true),
            () => undefined,
        )
    }

    let performOpen = async (run: Active): Promise<void> => {
        await dualRaf()
        if (active !== run || destroyed || run.isCancelled()) return
        animatePair(run)
    }

    let kick = (run: Active): void => {
        if (run.started || run !== active || destroyed) return
        if (run.opening) {
            if (!panel && !backdrop) return
            run.started = true
            let tx = dockTransforms(run.mode, edge)
            if (panel) {
                applyPanel(panel, tx.closed)
                void panel.offsetWidth
            }
            if (backdrop) applyStyles(backdrop, { opacity: "0", "will-change": "opacity" })
            void performOpen(run)
            return
        }
        if (!panel && !backdrop) {
            finish(run, true)
            return
        }
        run.started = true
        if (panel) {
            applyPanel(panel, dockTransforms(run.mode, edge).open)
            void panel.offsetWidth
        }
        if (backdrop) applyStyles(backdrop, { opacity: "1", "will-change": "opacity" })
        animatePair(run)
    }

    let bindCancel = (run: Active): void => {
        let cancel = run.playback.cancel
        run.playback.cancel = () => {
            if (active === run) {
                run.panelAnim?.cancel()
                run.backdropAnim?.cancel()
                active = null
                animating = false
                leaving = false
                if (!wantOpen) {
                    mounted = false
                    clearPanel()
                    clearBackdrop()
                }
            }
            cancel()
        }
    }

    let setOpen = (open: boolean): Playback => {
        if (destroyed) {
            let { playback, resolve } = createPlayback()
            resolve(false)
            return playback
        }

        if (open === wantOpen && mounted === open && !animating) {
            let { playback, resolve } = createPlayback()
            resolve(true)
            return playback
        }

        abortActive()
        wantOpen = open

        let mode = config.getMode()
        if (mode === "none" || durationMs <= 0) {
            let { playback, resolve } = createPlayback()
            settleInstant(open)
            resolve(true)
            return playback
        }

        let { playback, resolve, isCancelled } = createPlayback()
        mounted = true
        leaving = !open
        animating = true
        let run: Active = {
            opening: open,
            mode,
            playback,
            resolve,
            isCancelled,
            panelAnim: null,
            backdropAnim: null,
            started: false,
        }
        active = run
        bindCancel(run)
        kick(run)
        return playback
    }

    let attach = (el: HTMLElement): DockHandle => {
        if (!destroyed) {
            panel = el
            if (active) kick(active)
        }
        return {
            destroy: (): void => {
                if (panel === el) panel = null
            },
        }
    }

    let attachBackdrop = (el: HTMLElement): DockHandle => {
        if (!destroyed) {
            backdrop = el
            if (active) kick(active)
        }
        return {
            destroy: (): void => {
                if (backdrop === el) backdrop = null
            },
        }
    }

    let destroy = (): void => {
        if (destroyed) return
        destroyed = true
        abortActive()
        clearPanel()
        clearBackdrop()
        mounted = false
        leaving = false
        animating = false
        wantOpen = false
        panel = null
        backdrop = null
    }

    return {
        get mounted(): boolean {
            return mounted
        },
        get leaving(): boolean {
            return leaving
        },
        get animating(): boolean {
            return animating
        },
        setOpen,
        attach,
        attachBackdrop,
        destroy,
    }
}
