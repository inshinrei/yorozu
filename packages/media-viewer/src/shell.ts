/**
 * Open/close phase machine and content-switch animation direction.
 */
import type { MediaViewerNavFrom } from "./types"

export const MEDIA_OPEN_MS: number = 220
export const MEDIA_CLOSE_MS: number = 200
export const MEDIA_CHROME_MS: number = 150
export const MEDIA_SWITCH_MS: number = 320

export type MediaOpenClosePhase =
    | { kind: "open-flight"; pinnedUrl: string | null; scrimSolid: boolean }
    | { kind: "ready" }
    | { kind: "close-flight" }

export type MediaSwitchDirection = "none" | "older" | "newer" | "jump"

export type MediaShell = {
    phase: () => MediaOpenClosePhase
    openPhase: () => "opening" | "open" | "closing"
    mediaRevealed: () => boolean
    pinnedPreviewUrl: () => string | null
    switchDir: () => MediaSwitchDirection
    switchAnimKey: () => number
    startOpen: () => Promise<void>
    requestClose: () => Promise<void>
    forceClose: () => void
    trackContentKey: (contentKey: string) => void
    markNav: (kind: MediaViewerNavFrom) => void
    destroy: () => void
}

/** Leading integer or `index:id` so adjacent prev/next can set switchDir. */
function contentIndex(key: string): number | null {
    let colon = key.indexOf(":")
    let head = colon >= 0 ? key.slice(0, colon) : key
    if (head === "") return null
    let n = Number(head)
    if (!Number.isFinite(n)) return null
    return n
}

function tick(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve())
            return
        }
        resolve()
    })
}

export function createMediaShell(opts: {
    skipGhost: () => boolean
    hasOpenOrigin: () => boolean
    getOpenPinnedUrl?: () => string | null
    runOpenGhost?: (hooks: { onLand: () => void | Promise<void> }) => boolean | Promise<boolean>
    runCloseGhost?: () => boolean | Promise<boolean>
    cancelGhost?: () => void
    onFinishClose: () => void
    lastNav?: () => MediaViewerNavFrom | null
}): MediaShell {
    let alive = true
    let finished = false
    let openStarted = false
    let closeTimer: ReturnType<typeof setTimeout> | null = null
    let closeWait: (() => void) | null = null
    let markedNav: MediaViewerNavFrom | null = null
    let lastKey: string | null = null
    let switchDirection: MediaSwitchDirection = "none"
    let switchKey = 0
    let currentPhase: MediaOpenClosePhase =
        opts.skipGhost() || !opts.hasOpenOrigin()
            ? { kind: "ready" }
            : { kind: "open-flight", pinnedUrl: opts.getOpenPinnedUrl?.() ?? null, scrimSolid: false }

    function resolveLastNav(): MediaViewerNavFrom | null {
        return markedNav ?? opts.lastNav?.() ?? null
    }

    function finishClose(): void {
        if (finished) return
        finished = true
        if (closeTimer != null) {
            clearTimeout(closeTimer)
            closeTimer = null
        }
        let wait = closeWait
        closeWait = null
        wait?.()
        opts.onFinishClose()
    }

    async function startOpen(): Promise<void> {
        if (!alive) return
        if (opts.skipGhost() || !opts.hasOpenOrigin()) {
            currentPhase = { kind: "ready" }
            return
        }
        if (currentPhase.kind !== "open-flight") return
        if (openStarted) return
        openStarted = true
        await tick()
        if (!alive || currentPhase.kind !== "open-flight") return
        currentPhase = { kind: "open-flight", pinnedUrl: currentPhase.pinnedUrl, scrimSolid: true }
        let ran = false
        try {
            ran =
                (await opts.runOpenGhost?.({
                    onLand: async () => {
                        if (!alive || finished || currentPhase.kind !== "open-flight") return
                        currentPhase = { kind: "ready" }
                        await tick()
                    },
                })) === true
        } catch {
            ran = false
        }
        if (!alive || finished) return
        if (!ran && currentPhase.kind === "open-flight") currentPhase = { kind: "ready" }
    }

    async function requestClose(): Promise<void> {
        if (!alive || finished) return
        if (currentPhase.kind === "close-flight") return
        if (opts.skipGhost()) {
            opts.cancelGhost?.()
            finishClose()
            return
        }
        currentPhase = { kind: "close-flight" }
        let ran = false
        try {
            ran = (await opts.runCloseGhost?.()) === true
        } catch {
            ran = false
        }
        if (!alive || finished) return
        if (ran) {
            finishClose()
            return
        }
        await new Promise<void>((resolve) => {
            closeWait = resolve
            closeTimer = setTimeout(() => {
                closeTimer = null
                closeWait = null
                resolve()
            }, MEDIA_CLOSE_MS)
        })
        if (!alive || finished) return
        finishClose()
    }

    function forceClose(): void {
        if (!alive || finished) return
        opts.cancelGhost?.()
        finishClose()
    }

    function trackContentKey(contentKey: string): void {
        if (lastKey == null) {
            lastKey = contentKey
            return
        }
        if (contentKey === lastKey) return
        let prev = lastKey
        lastKey = contentKey
        switchKey += 1
        if (resolveLastNav() === "swipe") {
            switchDirection = "none"
            return
        }
        let from = contentIndex(prev)
        let to = contentIndex(contentKey)
        if (from != null && to != null && to === from - 1) {
            switchDirection = "older"
            return
        }
        if (from != null && to != null && to === from + 1) {
            switchDirection = "newer"
            return
        }
        switchDirection = "jump"
    }

    function markNav(kind: MediaViewerNavFrom): void {
        markedNav = kind
    }

    function destroy(): void {
        if (!alive) return
        alive = false
        if (closeTimer != null) {
            clearTimeout(closeTimer)
            closeTimer = null
        }
        let wait = closeWait
        closeWait = null
        wait?.()
        opts.cancelGhost?.()
    }

    function openPhase(): "opening" | "open" | "closing" {
        if (currentPhase.kind === "close-flight") return "closing"
        if (currentPhase.kind === "open-flight" && !currentPhase.scrimSolid) return "opening"
        return "open"
    }

    return {
        phase: () => currentPhase,
        openPhase,
        mediaRevealed: () => currentPhase.kind !== "open-flight",
        pinnedPreviewUrl: () => (currentPhase.kind === "open-flight" ? currentPhase.pinnedUrl : null),
        switchDir: () => switchDirection,
        switchAnimKey: () => switchKey,
        startOpen,
        requestClose,
        forceClose,
        trackContentKey,
        markNav,
        destroy,
    }
}
