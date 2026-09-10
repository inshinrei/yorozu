/**
 * Shared-element ghost flight for media open/close.
 */
import {
    SHARED_ELEMENT_END_MS,
    SHARED_ELEMENT_MS,
    centerFitInViewport,
    createSharedElement,
    fitContain,
    resolveNaturalSize,
    type SharedElementSeed,
} from "@yorozu/animations"
import { stageContentSize } from "./layout"
import type { MediaViewerOrigin } from "./types"

export const MEDIA_GHOST_ANIMATING_CLASS: string = "yorozu-media-ghost-animating"
export const MEDIA_GHOST_HANDOFF_CLASS: string = "yorozu-media-ghost-handoff"
export const MEDIA_GHOST_MS: number = SHARED_ELEMENT_MS
export const MEDIA_GHOST_END_MS: number = SHARED_ELEMENT_END_MS
export const DEFAULT_MEDIA_INSETS: { top: number; right: number; bottom: number; left: number } = {
    top: 52,
    right: 12,
    bottom: 52,
    left: 12,
}

export type MediaGhostHandle = { cancel: () => void; done: Promise<boolean> }

export type MediaGhost = {
    playOpen: (opts: {
        host: HTMLElement
        seed: MediaViewerOrigin
        to?: { top: number; left: number; width: number; height: number } | null
        hideTarget?: HTMLElement | null
        durationMs?: number
        onLand?: () => void | Promise<void>
    }) => MediaGhostHandle | null
    playClose: (opts: {
        host: HTMLElement
        fromStage: { top: number; left: number; width: number; height: number }
        target: MediaViewerOrigin | null
        imageUrl?: string | null
        fadeOut?: boolean
        hideTarget?: HTMLElement | null
        durationMs?: number
    }) => MediaGhostHandle | null
    cancel: () => void
}

function toSeed(origin: MediaViewerOrigin): SharedElementSeed {
    return {
        rect: origin.rect,
        imageUrl: origin.imageUrl,
        objectFit: origin.objectFit,
        naturalWidth: origin.naturalWidth,
        naturalHeight: origin.naturalHeight,
    }
}

function paddingPx(raw: string, fallback: number): number {
    let n = parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
}

export function computeStageFitRectFromElement(
    stageEl: HTMLElement,
    natural: { width: number; height: number },
): { top: number; left: number; width: number; height: number } | null {
    let rect = stageEl.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return null
    let style = getComputedStyle(stageEl)
    let padding = {
        top: paddingPx(style.paddingTop, DEFAULT_MEDIA_INSETS.top),
        right: paddingPx(style.paddingRight, DEFAULT_MEDIA_INSETS.right),
        bottom: paddingPx(style.paddingBottom, DEFAULT_MEDIA_INSETS.bottom),
        left: paddingPx(style.paddingLeft, DEFAULT_MEDIA_INSETS.left),
    }
    let viewport = { width: rect.width, height: rect.height }
    let content = stageContentSize(viewport.width, viewport.height, padding)
    let size = resolveNaturalSize(natural.width, natural.height, {
        top: 0,
        left: 0,
        width: content.width,
        height: content.height,
    })
    let fit = fitContain(size, content)
    if (!fit) return null
    let centered = centerFitInViewport(fit, viewport, padding)
    return {
        top: rect.top + centered.top,
        left: rect.left + centered.left,
        width: centered.width,
        height: centered.height,
    }
}

export function createMediaGhost(opts?: { animatingClass?: string; handoffClass?: string }): MediaGhost {
    let animatingClass = opts?.animatingClass ?? MEDIA_GHOST_ANIMATING_CLASS
    let handoffClass = opts?.handoffClass ?? MEDIA_GHOST_HANDOFF_CLASS
    let se = createSharedElement()
    let gen = 0

    function htmlEl(): HTMLElement | null {
        if (typeof document === "undefined") return null
        return document.documentElement
    }

    function setAnimating(on: boolean): void {
        let el = htmlEl()
        if (!el) return
        if (on) {
            el.classList.add(animatingClass)
            return
        }
        el.classList.remove(animatingClass)
        el.classList.remove(handoffClass)
    }

    function stampClone(host: HTMLElement): void {
        let clone = host.lastElementChild
        if (!(clone instanceof HTMLElement)) return
        clone.setAttribute("data-yorozu-media-ghost", "")
    }

    function playOpen(playOpts: {
        host: HTMLElement
        seed: MediaViewerOrigin
        to?: { top: number; left: number; width: number; height: number } | null
        hideTarget?: HTMLElement | null
        durationMs?: number
        onLand?: () => void | Promise<void>
    }): MediaGhostHandle | null {
        let my = ++gen
        setAnimating(true)
        let playback = se.playOpen({
            host: playOpts.host,
            seed: toSeed(playOpts.seed),
            to: playOpts.to,
            insets: DEFAULT_MEDIA_INSETS,
            hideTarget: playOpts.hideTarget,
            durationMs: playOpts.durationMs,
            onLand: async () => {
                if (gen !== my) return
                htmlEl()?.classList.add(handoffClass)
                await playOpts.onLand?.()
            },
        })
        if (!playback) {
            if (gen === my) setAnimating(false)
            return null
        }
        stampClone(playOpts.host)
        return {
            cancel: () => {
                playback.cancel()
                if (gen === my) setAnimating(false)
            },
            done: playback.done.then((ran) => {
                if (gen === my) setAnimating(false)
                return ran
            }),
        }
    }

    function playClose(playOpts: {
        host: HTMLElement
        fromStage: { top: number; left: number; width: number; height: number }
        target: MediaViewerOrigin | null
        imageUrl?: string | null
        fadeOut?: boolean
        hideTarget?: HTMLElement | null
        durationMs?: number
    }): MediaGhostHandle | null {
        let my = ++gen
        setAnimating(true)
        let playback = se.playClose({
            host: playOpts.host,
            fromStage: playOpts.fromStage,
            target: playOpts.target ? toSeed(playOpts.target) : null,
            imageUrl: playOpts.imageUrl,
            fadeOut: playOpts.fadeOut,
            hideTarget: playOpts.hideTarget,
            durationMs: playOpts.durationMs,
        })
        if (!playback) {
            return null
        }
        stampClone(playOpts.host)
        return {
            cancel: () => {
                playback.cancel()
                if (gen === my) setAnimating(false)
            },
            done: playback.done,
        }
    }

    function cancel(): void {
        gen += 1
        se.cancel()
        setAnimating(false)
    }

    return { playOpen, playClose, cancel }
}
