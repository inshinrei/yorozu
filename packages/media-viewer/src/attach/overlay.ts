import { MEDIA_SWIPE_WHEEL_COOLDOWN_MS } from "../swipe"

export type AttachOverlayNodes = {
    overlay: HTMLElement
    viewport: HTMLElement
    strip: HTMLElement
    header: HTMLElement
    footer: HTMLElement
    chromeEl: HTMLElement
    backdrop: HTMLElement
}

export type AttachOverlay = {
    nodes: () => AttachOverlayNodes | null
    abortSignal: () => AbortSignal | null
    mount: () => AttachOverlayNodes
    unmount: (unmountOpts?: { linger?: boolean }) => void
    armLinger: () => void
    clearLinger: () => void
}

export function createOverlay(opts: {
    root: HTMLElement
    ariaLabel: () => string
    measureZoom: () => void
}): AttachOverlay {
    let abort: AbortController | null = null
    let nodesBag: AttachOverlayNodes | null = null
    let lingerAbort: AbortController | null = null
    let lingerTimer: ReturnType<typeof setTimeout> | null = null
    let resizeObserver: ResizeObserver | null = null

    function clearLinger(): void {
        if (lingerTimer != null) {
            clearTimeout(lingerTimer)
            lingerTimer = null
        }
        lingerAbort?.abort()
        lingerAbort = null
    }

    function startLingerTimer(): void {
        if (lingerTimer != null) clearTimeout(lingerTimer)
        lingerTimer = setTimeout(() => {
            lingerTimer = null
            clearLinger()
        }, MEDIA_SWIPE_WHEEL_COOLDOWN_MS)
    }

    function armLinger(): void {
        clearLinger()
        lingerAbort = new AbortController()
        let signal = lingerAbort.signal
        const onLingerScroll = (e: Event): void => {
            e.preventDefault()
        }
        window.addEventListener("wheel", onLingerScroll, { capture: true, passive: false, signal })
        window.addEventListener("touchmove", onLingerScroll, { capture: true, passive: false, signal })
        startLingerTimer()
    }

    function mount(): AttachOverlayNodes {
        clearLinger()
        abort = new AbortController()
        let signal = abort.signal
        let overlay = document.createElement("div")
        overlay.setAttribute("data-yorozu-media-viewer", "")
        overlay.setAttribute("role", "dialog")
        overlay.setAttribute("aria-modal", "true")
        overlay.setAttribute("aria-label", opts.ariaLabel())
        overlay.tabIndex = -1

        let viewport = document.createElement("div")
        viewport.setAttribute("data-yorozu-media-viewport", "")
        let strip = document.createElement("div")
        strip.setAttribute("data-yorozu-media-strip", "")
        strip.style.setProperty("--yorozu-media-slide-gap", "40px")
        viewport.append(strip)

        let backdrop = document.createElement("div")
        backdrop.setAttribute("data-yorozu-media-backdrop", "")
        let header = document.createElement("div")
        header.setAttribute("data-yorozu-media-header", "")
        let footer = document.createElement("div")
        footer.setAttribute("data-yorozu-media-footer", "")
        let chromeEl = document.createElement("div")
        chromeEl.setAttribute("data-yorozu-media-chrome", "")

        overlay.append(backdrop, viewport, header, footer, chromeEl)
        opts.root.append(overlay)
        let nodes: AttachOverlayNodes = { overlay, viewport, strip, header, footer, chromeEl, backdrop }
        nodesBag = nodes

        let filmstripTouchX: number | null = null
        let filmstripTouchY: number | null = null
        const clearFilmstripTouchSample = (): void => {
            filmstripTouchX = null
            filmstripTouchY = null
        }
        const lockPageScroll = (e: Event): void => {
            let t = e.target
            // Window/document are not Elements (jsdom also breaks `currentTarget === window`).
            if (!(e.currentTarget instanceof Element)) {
                if (nodesBag != null && t instanceof Node && nodesBag.overlay.contains(t)) return
                e.preventDefault()
                e.stopPropagation()
                return
            }
            if (t instanceof Element && t.closest("[data-yorozu-media-filmstrip]")) {
                e.stopPropagation()
                if (!isFilmstripPanX(e)) e.preventDefault()
                return
            }
            clearFilmstripTouchSample()
            if (
                t instanceof Element &&
                t.closest("[data-yorozu-media-header], [data-yorozu-media-footer], [data-yorozu-media-chrome]")
            ) {
                e.stopPropagation()
                return
            }
            e.preventDefault()
            e.stopPropagation()
        }

        function isFilmstripPanX(e: Event): boolean {
            if (e instanceof WheelEvent) return Math.abs(e.deltaX) > Math.abs(e.deltaY)
            if (!(e instanceof TouchEvent)) return false
            let touch = e.touches[0] ?? e.changedTouches[0]
            if (!touch) return false
            let x = touch.clientX
            let y = touch.clientY
            if (filmstripTouchX == null || filmstripTouchY == null) {
                filmstripTouchX = x
                filmstripTouchY = y
                return false
            }
            let panX = Math.abs(x - filmstripTouchX) > Math.abs(y - filmstripTouchY)
            filmstripTouchX = x
            filmstripTouchY = y
            return panX
        }
        overlay.addEventListener("wheel", lockPageScroll, { passive: false, signal })
        overlay.addEventListener("touchmove", lockPageScroll, { passive: false, signal })
        window.addEventListener("wheel", lockPageScroll, { capture: true, passive: false, signal })
        window.addEventListener("touchmove", lockPageScroll, { capture: true, passive: false, signal })
        overlay.addEventListener("touchend", clearFilmstripTouchSample, { signal })
        overlay.addEventListener("touchcancel", clearFilmstripTouchSample, { signal })
        overlay.addEventListener("pointerup", clearFilmstripTouchSample, { signal })
        overlay.addEventListener("pointercancel", clearFilmstripTouchSample, { signal })

        if (typeof ResizeObserver === "function") {
            resizeObserver = new ResizeObserver(() => opts.measureZoom())
            resizeObserver.observe(viewport)
        }
        return nodes
    }

    function unmount(unmountOpts?: { linger?: boolean }): void {
        resizeObserver?.disconnect()
        resizeObserver = null
        abort?.abort()
        abort = null
        nodesBag?.overlay.remove()
        nodesBag = null
        if (unmountOpts?.linger === true) armLinger()
    }

    return {
        nodes: (): AttachOverlayNodes | null => nodesBag,
        abortSignal: (): AbortSignal | null => abort?.signal ?? null,
        mount,
        unmount,
        armLinger,
        clearLinger,
    }
}
