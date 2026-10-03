import { dualRaf } from "@yorozu/animations"
import { createVirtualList, listSliceForViewport, type VirtualList } from "@yorozu/virtual-list"
import { applyCanvasImageSource, type MediaDecodePort } from "../decode"
import {
    filmstripCentersScrollLeft,
    filmstripCurrentWidthPx,
    filmstripEdgeFade,
    filmstripEndInsetPx,
    filmstripGapAfterAtProgress,
    filmstripInterpolatedWidthPx,
    filmstripOverflows,
    filmstripSwipeNeighborIndex,
    filmstripSwipeProgress,
    filmstripThumbPitchPx,
} from "../filmstrip"
import {
    DEFAULT_FILMSTRIP_CURRENT_GAP_PX,
    DEFAULT_FILMSTRIP_CURRENT_ITEM_SIZE_PX,
    DEFAULT_FILMSTRIP_GAP_PX,
    DEFAULT_FILMSTRIP_ITEM_SIZE_PX,
    DEFAULT_FILMSTRIP_THUMB_HEIGHT_PX,
} from "../session"
import type { MediaSwipe } from "../swipe-controller"
import type { MediaViewer, MediaViewerItem, MediaViewerSnapshot } from "../types"
import { rootFontSizePx, tokenLengthPx, viewportFallback, type FilmstripMetrics } from "./css"

export type FilmstripMorph = {
    progress: number
    neighborIndex: number | null
    live: boolean
}

export type AttachFilmstripDom = {
    paint: (snap: MediaViewerSnapshot) => void
    stampGeometry: (snap: MediaViewerSnapshot) => void
    centerCurrent: (behavior: ScrollBehavior) => void
    paintedThumbIds: (snap: MediaViewerSnapshot) => string[]
    morph: (snap: MediaViewerSnapshot) => FilmstripMorph
    withMetrics: (run: () => void) => void
    refreshThumbsAfterSettle: () => void
    destroy: () => void
}

export function createFilmstripDom(opts: {
    getOverlay: () => HTMLElement | null
    getViewport: () => HTMLElement | null
    getAbortSignal: () => AbortSignal | null
    viewer: MediaViewer
    swipe: MediaSwipe
    decodePort: MediaDecodePort
    isDetached: () => boolean
    reducedMotion: () => boolean
    emitVisible: () => void
    openPhase: () => "opening" | "open" | "closing" | null
}): AttachFilmstripDom {
    let filmstripEl: HTMLElement | null = null
    let filmstripIds: string | null = null
    let filmstripCenteredIndex: number | null = null
    let filmstripLiveScroll = false
    let filmstripList: VirtualList<string> | null = null
    let filmstripListNeighborSize: number | null = null
    let filmstripListCurrentSize: number | null = null
    let filmstripPaintMetricsCache: FilmstripMetrics | null = null
    let filmstripMorphCache: FilmstripMorph | null = null
    let filmstripRoleWidthsCache: {
        neighborWidth: number
        currentWidth: number
        incomingWidth: number
    } | null = null
    let filmstripResizeObserver: ResizeObserver | null = null
    let thumbDecodeKeys = new WeakMap<HTMLElement, string>()

    function paintedThumbIds(snap: MediaViewerSnapshot): string[] {
        if (!snap.filmstrip) return []
        if (opts.viewer.filmstripVirtualize()) return filmstripList?.viewportIds() ?? []
        return snap.items.map((item) => item.id)
    }

    function itemIdKey(list: readonly MediaViewerItem[]): string {
        return list.map((item) => item.id).join("\0")
    }

    function thumbSrc(item: MediaViewerItem): string | null {
        let helper = opts.viewer.filmstripThumbSrc()
        if (helper) return helper(item)
        return item.poster ?? item.src ?? null
    }

    function markThumbCurrent(btn: HTMLButtonElement, current: boolean): void {
        if (current) {
            btn.setAttribute("aria-current", "true")
            btn.setAttribute("data-current", "")
            btn.disabled = true
            return
        }
        btn.removeAttribute("aria-current")
        btn.removeAttribute("data-current")
        btn.disabled = false
    }

    function fillThumb(btn: HTMLButtonElement, item: MediaViewerItem): void {
        if (item.kind === "video") btn.setAttribute("data-yorozu-media-thumb-video", "")
        else btn.removeAttribute("data-yorozu-media-thumb-video")
        let src = thumbSrc(item)
        let hostDecode = opts.viewer.decodeFn()
        if (hostDecode && src) {
            let key = `${item.id}:${src}`
            if (thumbDecodeKeys.get(btn) === key) return
            thumbDecodeKeys.set(btn, key)
            btn.querySelector("img")?.remove()
            btn.querySelector("canvas")?.remove()
            let existingLoading = btn.querySelector("[data-yorozu-media-loading]")
            if (!existingLoading) {
                let placeholder = document.createElement("div")
                placeholder.setAttribute("data-yorozu-media-loading", "")
                btn.append(placeholder)
            }
            void opts.decodePort
                .request({
                    id: `thumb:${item.id}`,
                    role: "thumb",
                    src,
                    decode: (req) => hostDecode({ ...req, id: item.id }),
                })
                .then((source: CanvasImageSource | null): void => {
                    if (
                        opts.isDetached() ||
                        !btn.isConnected ||
                        opts.viewer.isGesturing() ||
                        thumbDecodeKeys.get(btn) !== key
                    ) {
                        return
                    }
                    btn.replaceChildren()
                    if (source) {
                        applyCanvasImageSource(btn, source, { alt: item.alt ?? "" })
                        restampCurrentFilmstripWidth(btn, item, key)
                    }
                })
            return
        }
        let image = btn.querySelector("img")
        let loading = btn.querySelector("[data-yorozu-media-loading]")
        if (src) {
            loading?.remove()
            let key = `${item.id}:${src}`
            thumbDecodeKeys.set(btn, key)
            let onThumbError = (): void => {
                if (opts.isDetached() || !btn.isConnected || thumbDecodeKeys.get(btn) !== key) return
                btn.replaceChildren()
            }
            let onThumbLoad = (): void => {
                restampCurrentFilmstripWidth(btn, item, key)
            }
            if (image instanceof HTMLImageElement) {
                image.alt = item.alt ?? ""
                image.draggable = false
                image.onerror = onThumbError
                image.onload = onThumbLoad
                if (image.getAttribute("src") !== src) image.src = src
                return
            }
            let next = document.createElement("img")
            next.alt = item.alt ?? ""
            next.draggable = false
            next.onerror = onThumbError
            next.onload = onThumbLoad
            btn.append(next)
            next.src = src
            return
        }
        image?.remove()
        if (loading) return
        let placeholder = document.createElement("div")
        placeholder.setAttribute("data-yorozu-media-loading", "")
        btn.append(placeholder)
    }

    function readFilmstripMetrics(): FilmstripMetrics {
        let overlay = opts.getOverlay()
        let style = overlay != null && typeof getComputedStyle === "function" ? getComputedStyle(overlay) : null
        let root = rootFontSizePx()
        return {
            neighborWidth: tokenLengthPx(
                style,
                "--yorozu-media-filmstrip-thumb-w",
                DEFAULT_FILMSTRIP_ITEM_SIZE_PX,
                root,
            ),
            height: tokenLengthPx(style, "--yorozu-media-filmstrip-thumb-h", DEFAULT_FILMSTRIP_THUMB_HEIGHT_PX, root),
            cap: tokenLengthPx(
                style,
                "--yorozu-media-filmstrip-current-w",
                DEFAULT_FILMSTRIP_CURRENT_ITEM_SIZE_PX,
                root,
            ),
            gap: tokenLengthPx(style, "--yorozu-media-filmstrip-gap", DEFAULT_FILMSTRIP_GAP_PX, root),
            currentGap: tokenLengthPx(
                style,
                "--yorozu-media-filmstrip-current-gap",
                DEFAULT_FILMSTRIP_CURRENT_GAP_PX,
                root,
            ),
        }
    }

    function filmstripPaintMetrics(): FilmstripMetrics {
        if (filmstripPaintMetricsCache) return filmstripPaintMetricsCache
        return readFilmstripMetrics()
    }

    function withFilmstripMetrics(run: () => void): void {
        let owned = filmstripPaintMetricsCache == null
        if (owned) {
            filmstripPaintMetricsCache = readFilmstripMetrics()
            filmstripMorphCache = null
            filmstripRoleWidthsCache = null
        }
        try {
            run()
        } finally {
            if (owned) {
                filmstripPaintMetricsCache = null
                filmstripMorphCache = null
                filmstripRoleWidthsCache = null
            }
        }
    }

    function filmstripThumbAt(index: number): HTMLElement | null {
        if (!filmstripEl) return null
        let el = filmstripEl.querySelector(`[data-yorozu-media-thumb][data-index="${index}"]`)
        return el instanceof HTMLElement ? el : null
    }

    function filmstripContentWidthPx(
        item: MediaViewerItem | undefined,
        thumb: Element | null,
        metrics?: FilmstripMetrics,
    ): number {
        let m = metrics ?? filmstripPaintMetrics()
        let naturalWidth = item?.naturalWidth
        let naturalHeight = item?.naturalHeight
        if (!(naturalWidth != null && naturalHeight != null && naturalWidth > 0 && naturalHeight > 0)) {
            let image = thumb?.querySelector("img")
            if (image instanceof HTMLImageElement && image.naturalWidth > 0 && image.naturalHeight > 0) {
                naturalWidth = image.naturalWidth
                naturalHeight = image.naturalHeight
            }
        }
        return filmstripCurrentWidthPx({
            neighborWidth: m.neighborWidth,
            height: m.height,
            cap: m.cap,
            naturalWidth,
            naturalHeight,
        })
    }

    function filmstripStageViewportWidth(): number {
        let viewport = opts.getViewport()
        if (viewport) {
            let box = viewport.getBoundingClientRect()
            let width = box.width || viewport.clientWidth
            if (width > 0) return width
        }
        return viewportFallback().width
    }

    function filmstripMorph(snap: MediaViewerSnapshot): FilmstripMorph {
        if (filmstripMorphCache) return filmstripMorphCache
        let rest = { progress: 0, neighborIndex: null as number | null, live: false }
        let value = rest
        if (
            filmstripEl &&
            !opts.swipe.dismissing() &&
            (opts.swipe.gesturing() || opts.swipe.settling()) &&
            opts.swipe.axis() !== "vertical" &&
            // settleTo(0, 0) clears axis to "none" at hop start; keep morphing leftover offsetX.
            (opts.swipe.axis() === "horizontal" || opts.swipe.settling())
        ) {
            let offsetX = opts.swipe.offsetX()
            let neighborIndex = filmstripSwipeNeighborIndex(snap.index, offsetX, snap.items.length)
            if (neighborIndex != null) {
                value = {
                    progress: filmstripSwipeProgress(offsetX, filmstripStageViewportWidth()),
                    neighborIndex,
                    live: true,
                }
            }
        }
        if (filmstripPaintMetricsCache) filmstripMorphCache = value
        return value
    }

    function filmstripRoleWidths(
        snap: MediaViewerSnapshot,
        morph: { neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): { neighborWidth: number; currentWidth: number; incomingWidth: number } {
        if (opts.viewer.filmstripExplicitItemSize()) {
            let live = opts.viewer.filmstripItemSizes()
            return { neighborWidth: live.neighbor, currentWidth: live.current, incomingWidth: live.current }
        }
        return {
            neighborWidth: metrics.neighborWidth,
            currentWidth: filmstripContentWidthPx(snap.items[snap.index], filmstripThumbAt(snap.index), metrics),
            incomingWidth:
                morph.neighborIndex == null
                    ? metrics.neighborWidth
                    : filmstripContentWidthPx(
                          snap.items[morph.neighborIndex],
                          filmstripThumbAt(morph.neighborIndex),
                          metrics,
                      ),
        }
    }

    function filmstripPaintRoleWidths(
        snap: MediaViewerSnapshot,
        morph: { neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): { neighborWidth: number; currentWidth: number; incomingWidth: number } {
        if (filmstripRoleWidthsCache) return filmstripRoleWidthsCache
        let roles = filmstripRoleWidths(snap, morph, metrics)
        if (filmstripPaintMetricsCache) filmstripRoleWidthsCache = roles
        return roles
    }

    function filmstripWidthAt(
        index: number,
        snap: MediaViewerSnapshot,
        morph: { progress: number; neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): number {
        let roles = filmstripPaintRoleWidths(snap, morph, metrics)
        return filmstripInterpolatedWidthPx({
            index,
            current: snap.index,
            neighborIndex: morph.neighborIndex,
            progress: morph.progress,
            neighborWidth: roles.neighborWidth,
            currentWidth: roles.currentWidth,
            incomingWidth: roles.incomingWidth,
        })
    }

    function filmstripPitchAt(
        index: number,
        snap: MediaViewerSnapshot,
        morph: { progress: number; neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): number {
        // Host itemSizePx is already pitch (gap included). Interpolate those pitches; do not add gapAfter.
        if (opts.viewer.filmstripExplicitItemSize()) {
            return filmstripWidthAt(index, snap, morph, metrics)
        }
        let width = filmstripWidthAt(index, snap, morph, metrics)
        let gapAfter = filmstripGapAfterAtProgress(
            index,
            snap.index,
            morph.neighborIndex,
            morph.progress,
            metrics.gap,
            metrics.currentGap,
        )
        return filmstripThumbPitchPx(width, gapAfter)
    }

    function filmstripCenterAt(
        index: number,
        snap: MediaViewerSnapshot,
        morph: { progress: number; neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): number {
        if (opts.viewer.filmstripVirtualize() && filmstripList != null) {
            return filmstripList.rowTop(index) + filmstripWidthAt(index, snap, morph, metrics) / 2
        }
        let top = 0
        for (let i = 0; i < index; i++) top += filmstripPitchAt(i, snap, morph, metrics)
        return top + filmstripWidthAt(index, snap, morph, metrics) / 2
    }

    function filmstripInFlowTotalSize(
        snap: MediaViewerSnapshot,
        morph: { progress: number; neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): number {
        let total = 0
        for (let i = 0; i < snap.items.length; i++) total += filmstripPitchAt(i, snap, morph, metrics)
        return total
    }

    function filmstripContentTotalSize(
        snap: MediaViewerSnapshot,
        morph: { progress: number; neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): number {
        if (opts.viewer.filmstripVirtualize() && filmstripList != null) return filmstripList.totalSize()
        return filmstripInFlowTotalSize(snap, morph, metrics)
    }

    function filmstripScrollGeometry(
        snap: MediaViewerSnapshot,
        morph: { progress: number; neighborIndex: number | null },
        metrics: FilmstripMetrics,
    ): {
        viewportWidth: number
        totalSize: number
        overflows: boolean
        startPad: number
        endPad: number
    } {
        let viewportWidth = filmstripEl?.clientWidth ?? 0
        let contentSize = filmstripContentTotalSize(snap, morph, metrics)
        let overflows = filmstripOverflows(contentSize, viewportWidth)
        let lastIndex = snap.items.length - 1
        let trailing = 0
        if (lastIndex >= 0) {
            trailing = Math.max(
                0,
                filmstripPitchAt(lastIndex, snap, morph, metrics) - filmstripWidthAt(lastIndex, snap, morph, metrics),
            )
        }
        // Last pitch includes gap after the last thumb; clamp/fade use the last thumb's trailing edge.
        let totalSize = Math.max(0, contentSize - trailing)
        if (!overflows || snap.items.length === 0) {
            return { viewportWidth, totalSize, overflows, startPad: 0, endPad: 0 }
        }
        let startPad = filmstripEndInsetPx(filmstripWidthAt(0, snap, morph, metrics), viewportWidth)
        let endPad = filmstripEndInsetPx(filmstripWidthAt(lastIndex, snap, morph, metrics), viewportWidth)
        return { viewportWidth, totalSize, overflows, startPad, endPad }
    }

    function applyFilmstripEndPads(startPad: number, endPad: number, overflows: boolean): void {
        if (!filmstripEl) return
        let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
        if (!track) return
        if (overflows) {
            track.style.marginInlineStart = `${startPad}px`
            track.style.marginInlineEnd = `${endPad}px`
            return
        }
        track.style.marginInlineStart = ""
        track.style.marginInlineEnd = ""
    }

    function stampFilmstripClipFade(scrollLeft: number, maxLeft: number, overflows: boolean): void {
        if (!filmstripEl) return
        let fade = filmstripEdgeFade({ scrollLeft, maxLeft, overflows })
        let clip = filmstripEl.parentElement
        if (!clip?.hasAttribute("data-yorozu-media-filmstrip-clip")) return
        clip.setAttribute("data-fade-start", fade.start ? "true" : "false")
        clip.setAttribute("data-fade-end", fade.end ? "true" : "false")
    }

    function stampFilmstripClipFadeFromGeo(
        scrollLeft: number,
        geo: {
            viewportWidth: number
            totalSize: number
            overflows: boolean
            startPad: number
            endPad: number
        },
    ): void {
        let maxLeft = Math.max(0, geo.startPad + geo.totalSize + geo.endPad - geo.viewportWidth)
        stampFilmstripClipFade(scrollLeft, maxLeft, geo.overflows)
    }

    function filmstripVirtualPitch(index: number): number {
        let snap = opts.viewer.snapshot()
        let metrics = filmstripPaintMetrics()
        let morph = filmstripMorph(snap)
        return filmstripPitchAt(index, snap, morph, metrics)
    }

    function stampFilmstripMotion(): void {
        if (!filmstripEl) return
        filmstripEl.setAttribute("data-filmstrip-motion", opts.viewer.lastNav() === "jump" ? "tap" : "nav")
    }

    function stampFilmstripGeometry(snap: MediaViewerSnapshot): void {
        if (!filmstripEl) return
        let metrics = filmstripPaintMetrics()
        let morph = filmstripMorph(snap)
        if (morph.live) filmstripEl.setAttribute("data-filmstrip-motion", "swipe")
        else stampFilmstripMotion()
        if (opts.viewer.filmstripVirtualize() && filmstripList != null) {
            if (morph.neighborIndex != null) {
                let ids = filmstripList.viewportIds() ?? []
                let from = filmstripList.fromOffset()
                let last = from + ids.length - 1
                if (morph.neighborIndex < from || morph.neighborIndex > last) {
                    filmstripList.reanchor(snap.index)
                }
            }
            filmstripList.sync()
            let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
            if (track) rebuildVirtualThumbs(track, snap)
        } else {
            for (let el of filmstripEl.querySelectorAll("[data-yorozu-media-thumb]")) {
                if (!(el instanceof HTMLElement)) continue
                let index = Number(el.getAttribute("data-index"))
                if (!Number.isInteger(index)) continue
                let livePair =
                    morph.live && morph.progress > 0 && (index === snap.index || index === morph.neighborIndex)
                if (index === snap.index || livePair) {
                    el.style.width = `${filmstripWidthAt(index, snap, morph, metrics)}px`
                } else {
                    el.style.width = ""
                }
                if (morph.live && morph.progress > 0) {
                    let gapAfter = filmstripGapAfterAtProgress(
                        index,
                        snap.index,
                        morph.neighborIndex,
                        morph.progress,
                        metrics.gap,
                        metrics.currentGap,
                    )
                    el.style.marginInlineEnd = `${Math.max(0, gapAfter - metrics.gap)}px`
                    el.style.marginInlineStart = ""
                } else {
                    el.style.marginInlineEnd = ""
                    el.style.marginInlineStart = ""
                }
            }
        }
        stampFilmstripOverflow()
        let landRestScroll = filmstripLiveScroll && !morph.live
        filmstripLiveScroll = morph.live
        if (!morph.live && !landRestScroll) return
        let geo = filmstripScrollGeometry(snap, morph, metrics)
        let fromCenter = geo.startPad + filmstripCenterAt(snap.index, snap, morph, metrics)
        let toCenter =
            morph.neighborIndex == null
                ? fromCenter
                : geo.startPad + filmstripCenterAt(morph.neighborIndex, snap, morph, metrics)
        let left = filmstripCentersScrollLeft({
            fromCenter,
            toCenter,
            progress: morph.progress,
            viewportWidth: geo.viewportWidth,
            totalSize: geo.totalSize,
            startPad: geo.startPad,
            endPad: geo.endPad,
        })
        filmstripEl.scrollLeft = left
        if (opts.viewer.filmstripVirtualize()) syncFilmstripScroll(left)
        stampFilmstripClipFadeFromGeo(left, geo)
    }

    function stampFilmstripOverflow(): void {
        if (!filmstripEl) return
        let snap = opts.viewer.snapshot()
        let metrics = filmstripPaintMetrics()
        let morph = filmstripMorph(snap)
        let geo = filmstripScrollGeometry(snap, morph, metrics)
        applyFilmstripEndPads(geo.startPad, geo.endPad, geo.overflows)
        filmstripEl.setAttribute("data-overflow", geo.overflows ? "true" : "false")
        let clip = filmstripEl.parentElement
        if (clip?.hasAttribute("data-yorozu-media-filmstrip-clip")) {
            clip.setAttribute("data-overflow", geo.overflows ? "true" : "false")
        }
        let lastIndex = snap.items.length - 1
        for (let el of filmstripEl.querySelectorAll("[data-yorozu-media-thumb]")) {
            if (!(el instanceof HTMLElement)) continue
            el.removeAttribute("data-edge")
            if (geo.overflows) continue
            let index = Number(el.getAttribute("data-index"))
            if (index === 0) el.setAttribute("data-edge", "start")
            else if (index === lastIndex) el.setAttribute("data-edge", "end")
        }
        stampFilmstripClipFadeFromGeo(filmstripEl.scrollLeft, geo)
    }

    function observeFilmstripNav(nav: HTMLElement): void {
        filmstripResizeObserver?.disconnect()
        filmstripResizeObserver = null
        if (typeof ResizeObserver !== "function") return
        filmstripResizeObserver = new ResizeObserver(() => {
            if (opts.isDetached() || !filmstripEl) return
            withFilmstripMetrics(() => {
                if (opts.viewer.filmstripVirtualize() && filmstripList != null) {
                    applyFilmstripFitSlice(filmstripList, opts.viewer.snapshot())
                    let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
                    if (track) rebuildVirtualThumbs(track, opts.viewer.snapshot())
                }
                stampFilmstripOverflow()
            })
        })
        filmstripResizeObserver.observe(nav)
    }

    function restampCurrentFilmstripWidth(btn: HTMLButtonElement, item: MediaViewerItem, key: string): void {
        if (opts.isDetached() || !btn.isConnected || thumbDecodeKeys.get(btn) !== key) return
        if (!btn.hasAttribute("data-current")) return
        let hasItemNaturals =
            item.naturalWidth != null && item.naturalHeight != null && item.naturalWidth > 0 && item.naturalHeight > 0
        if (hasItemNaturals) return
        let snap = opts.viewer.snapshot()
        withFilmstripMetrics(() => {
            stampFilmstripGeometry(snap)
        })
    }

    function destroyFilmstripList(): void {
        filmstripList?.destroy()
        filmstripList = null
        filmstripListNeighborSize = null
        filmstripListCurrentSize = null
    }

    function filmstripSlice(viewportWidth: number): number {
        let itemSizePx = opts.viewer.filmstripItemSizePx()
        let overscan = opts.viewer.filmstripOverscan()
        return listSliceForViewport(viewportWidth, itemSizePx, {
            overscanRows: overscan,
            min: Math.max(4, overscan + 2),
        })
    }

    function resolveFilmstripListSlice(list: VirtualList<string>, viewportWidth: number): number {
        let slice = filmstripSlice(viewportWidth)
        let count = opts.viewer.snapshot().items.length
        let totalSize = list.totalSize()
        if (count > 0 && totalSize > 0 && !filmstripOverflows(totalSize, viewportWidth)) {
            return Math.max(slice, count)
        }
        return slice
    }

    function applyFilmstripFitSlice(list: VirtualList<string>, snap: MediaViewerSnapshot): void {
        if (!filmstripEl) return
        let slice = resolveFilmstripListSlice(list, filmstripEl.clientWidth)
        list.setListSlice(slice)
        let count = snap.items.length
        let mounted = list.viewportIds()?.length ?? 0
        let shouldGrow = count > 0 && slice >= count && mounted < count
        let shouldShrink = count > 0 && slice < count && mounted >= count
        if (shouldGrow || shouldShrink) {
            list.reanchor(snap.index)
            list.sync()
        }
    }

    function onFilmstripWindowChange(): void {
        if (opts.isDetached() || !filmstripEl || !filmstripList) return
        let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
        if (!track) return
        rebuildVirtualThumbs(track, opts.viewer.snapshot())
        stampFilmstripOverflow()
        opts.emitVisible()
    }

    function ensureFilmstripList(): VirtualList<string> {
        let sizes = opts.viewer.filmstripItemSizes()
        if (
            filmstripList &&
            filmstripListNeighborSize === sizes.neighbor &&
            filmstripListCurrentSize === sizes.current
        ) {
            filmstripList.setListSlice(filmstripSlice(filmstripEl?.clientWidth ?? 0))
            return filmstripList
        }
        destroyFilmstripList()
        filmstripListNeighborSize = sizes.neighbor
        filmstripListCurrentSize = sizes.current
        filmstripList = createVirtualList({
            getItems: (): readonly string[] => opts.viewer.snapshot().items.map((item) => item.id),
            itemSize: (index: number): number => {
                return filmstripVirtualPitch(index)
            },
            listSlice: filmstripSlice(filmstripEl?.clientWidth ?? 0),
            onChange: onFilmstripWindowChange,
            // Idle trim re-slices with LIST_SLICE_MIN (16); skip so a compact strip can stay smaller.
            scheduleIdle: (): { cancel(): void } => ({
                cancel(): void {},
            }),
        })
        return filmstripList
    }

    function syncFilmstripScroll(scrollLeft: number): void {
        if (!filmstripList || !filmstripEl) return
        filmstripList.setListSlice(resolveFilmstripListSlice(filmstripList, filmstripEl.clientWidth))
        // Engine is vertical: map strip scrollLeft → scrollTop, clientWidth → viewportHeight.
        filmstripList.onScroll({
            scrollTop: scrollLeft,
            viewportHeight: filmstripEl.clientWidth,
        })
    }

    function onFilmstripScroll(): void {
        if (!filmstripEl) return
        syncFilmstripScroll(filmstripEl.scrollLeft)
        stampFilmstripOverflow()
    }

    function rebuildThumbs(track: HTMLElement, snap: MediaViewerSnapshot): void {
        let metrics = filmstripPaintMetrics()
        track.replaceChildren()
        for (let i = 0; i < snap.items.length; i++) {
            let item = snap.items[i]!
            let btn = document.createElement("button")
            btn.type = "button"
            btn.setAttribute("data-yorozu-media-thumb", "")
            btn.setAttribute("data-id", item.id)
            btn.setAttribute("data-index", String(i))
            markThumbCurrent(btn, i === snap.index)
            fillThumb(btn, item)
            if (i === snap.index) {
                btn.style.width = `${filmstripContentWidthPx(item, btn, metrics)}px`
            } else {
                btn.style.width = ""
            }
            track.append(btn)
        }
    }

    function rebuildVirtualThumbs(track: HTMLElement, snap: MediaViewerSnapshot): void {
        if (!filmstripList) return
        let metrics = filmstripPaintMetrics()
        let morph = filmstripMorph(snap)
        let ids = filmstripList.viewportIds() ?? []
        let from = filmstripList.fromOffset()
        let prev = new Map<string, HTMLButtonElement>()
        for (let el of track.querySelectorAll("[data-yorozu-media-thumb]")) {
            if (!(el instanceof HTMLButtonElement)) continue
            let id = el.getAttribute("data-id")
            if (id) prev.set(id, el)
        }
        let keep = new Set<string>()
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i]!
            let index = from + i
            let item = snap.items[index]
            if (item == null || item.id !== id) {
                let found = snap.items.findIndex((it) => it.id === id)
                if (found < 0) continue
                index = found
                item = snap.items[found]!
            }
            keep.add(id)
            let btn = prev.get(id)
            if (!btn) {
                btn = document.createElement("button")
                btn.type = "button"
                btn.setAttribute("data-yorozu-media-thumb", "")
                btn.setAttribute("data-id", id)
            }
            btn.setAttribute("data-index", String(index))
            btn.style.position = "absolute"
            btn.style.left = `${filmstripList.rowTop(index)}px`
            btn.style.width = `${filmstripWidthAt(index, snap, morph, metrics)}px`
            markThumbCurrent(btn, index === snap.index)
            fillThumb(btn, item)
            if (!btn.isConnected) track.append(btn)
        }
        for (let el of [...track.querySelectorAll("[data-yorozu-media-thumb]")]) {
            if (!(el instanceof HTMLButtonElement)) continue
            let id = el.getAttribute("data-id")
            if (id == null || !keep.has(id)) el.remove()
        }
        track.style.width = `${filmstripList.totalSize()}px`
        track.style.flexShrink = "0"
        track.style.flexGrow = "0"
    }

    function syncThumbs(track: HTMLElement, snap: MediaViewerSnapshot): void {
        if (filmstripList) {
            rebuildVirtualThumbs(track, snap)
            return
        }
        let thumbs = track.querySelectorAll("[data-yorozu-media-thumb]")
        for (let i = 0; i < snap.items.length; i++) {
            let el = thumbs[i]
            if (!(el instanceof HTMLButtonElement)) continue
            markThumbCurrent(el, i === snap.index)
            fillThumb(el, snap.items[i]!)
        }
    }

    function centerCurrentThumb(behavior: ScrollBehavior): void {
        if (!filmstripEl) return
        let snap = opts.viewer.snapshot()
        let metrics = filmstripPaintMetrics()
        let morph = filmstripMorph(snap)
        let geo = filmstripScrollGeometry(snap, morph, metrics)
        applyFilmstripEndPads(geo.startPad, geo.endPad, geo.overflows)
        let fromCenter = geo.startPad + filmstripCenterAt(snap.index, snap, morph, metrics)
        let left = filmstripCentersScrollLeft({
            fromCenter,
            toCenter: fromCenter,
            progress: 1,
            viewportWidth: geo.viewportWidth,
            totalSize: geo.totalSize,
            startPad: geo.startPad,
            endPad: geo.endPad,
        })
        if (typeof filmstripEl.scrollTo === "function") {
            filmstripEl.scrollTo({ left, behavior })
        } else {
            filmstripEl.scrollLeft = left
        }
        stampFilmstripClipFadeFromGeo(left, geo)
        if (!opts.viewer.filmstripVirtualize()) return
        // Smooth: live scrollLeft is still the old offset; let the scroll event drive the engine.
        if (behavior === "smooth") return
        syncFilmstripScroll(left)
    }

    function onFilmstripClick(e: Event): void {
        let t = e.target
        if (!(t instanceof Element)) return
        let btn = t.closest("[data-yorozu-media-thumb]")
        if (!(btn instanceof HTMLButtonElement) || btn.disabled) return
        let i = Number(btn.getAttribute("data-index"))
        if (!Number.isInteger(i)) return
        opts.viewer.goTo(i)
    }

    function removeFilmstrip(): void {
        filmstripResizeObserver?.disconnect()
        filmstripResizeObserver = null
        destroyFilmstripList()
        let clip = filmstripEl?.parentElement
        if (clip?.hasAttribute("data-yorozu-media-filmstrip-clip")) clip.remove()
        else filmstripEl?.remove()
        filmstripEl = null
        filmstripIds = null
        filmstripCenteredIndex = null
        filmstripLiveScroll = false
    }

    function paintFilmstrip(snap: MediaViewerSnapshot): void {
        let overlay = opts.getOverlay()
        if (!overlay) return
        if (!snap.filmstrip) {
            removeFilmstrip()
            return
        }
        let virtualize = opts.viewer.filmstripVirtualize()
        let createdThisPaint = false
        if (!filmstripEl) {
            createdThisPaint = true
            filmstripEl = document.createElement("nav")
            filmstripEl.setAttribute("data-yorozu-media-filmstrip", "")
            filmstripEl.setAttribute("role", "navigation")
            filmstripEl.setAttribute("aria-label", "Gallery items")
            let track = document.createElement("div")
            track.setAttribute("role", "list")
            filmstripEl.append(track)
            let abortSignal = opts.getAbortSignal()
            filmstripEl.addEventListener("click", onFilmstripClick, abortSignal ? { signal: abortSignal } : undefined)
            filmstripEl.addEventListener("scroll", onFilmstripScroll, abortSignal ? { signal: abortSignal } : undefined)
            let clip = document.createElement("div")
            clip.setAttribute("data-yorozu-media-filmstrip-clip", "")
            clip.append(filmstripEl)
            overlay.append(clip)
            filmstripIds = null
            observeFilmstripNav(filmstripEl)
        }
        stampFilmstripMotion()
        if (virtualize) {
            filmstripEl.setAttribute("data-virtualized", "")
            filmstripEl.style.removeProperty("--yorozu-media-filmstrip-item-size")
        } else {
            filmstripEl.removeAttribute("data-virtualized")
            filmstripEl.style.removeProperty("--yorozu-media-filmstrip-item-size")
            destroyFilmstripList()
        }
        let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
        if (!track) return
        filmstripPaintMetricsCache = readFilmstripMetrics()
        filmstripMorphCache = null
        filmstripRoleWidthsCache = null
        try {
            let shouldCenter = true
            if (virtualize) {
                let ids = itemIdKey(snap.items)
                let idsChanged = filmstripIds !== ids
                let indexChanged = filmstripCenteredIndex !== snap.index
                let shouldReanchor = idsChanged || indexChanged || filmstripCenteredIndex == null
                let list = ensureFilmstripList()
                // First sync windows from sourceIds[0]; reanchor before that emit.
                if (shouldReanchor || list.viewportIds() === undefined) list.reanchor(snap.index)
                list.sync()
                applyFilmstripFitSlice(list, snap)
                filmstripIds = ids
                if (shouldReanchor) filmstripCenteredIndex = snap.index
                shouldCenter = shouldReanchor
            } else {
                track.style.width = ""
                track.style.flexShrink = ""
                track.style.flexGrow = ""
                filmstripCenteredIndex = null
                let ids = itemIdKey(snap.items)
                if (filmstripIds !== ids) {
                    rebuildThumbs(track, snap)
                    filmstripIds = ids
                } else {
                    syncThumbs(track, snap)
                }
            }
            stampFilmstripGeometry(snap)
            if (filmstripMorph(snap).live) return
            if (!shouldCenter) return
            let instant = opts.reducedMotion() || createdThisPaint || opts.openPhase() !== "open"
            let behavior: ScrollBehavior = instant ? "instant" : "smooth"
            centerCurrentThumb(behavior)
            void dualRaf().then(() => {
                if (opts.isDetached() || !filmstripEl) return
                if (filmstripMorph(opts.viewer.snapshot()).live) return
                centerCurrentThumb(behavior)
            })
        } finally {
            filmstripPaintMetricsCache = null
            filmstripMorphCache = null
            filmstripRoleWidthsCache = null
        }
    }

    function refreshThumbsAfterSettle(): void {
        let snap = opts.viewer.snapshot()
        if (!filmstripEl || !snap.filmstrip) return
        let track = filmstripEl.querySelector('[role="list"]') as HTMLElement | null
        if (!track) return
        for (let el of track.querySelectorAll("[data-yorozu-media-thumb]")) {
            if (!(el instanceof HTMLElement)) continue
            if (el.querySelector("img, canvas")) continue
            thumbDecodeKeys.delete(el)
        }
        syncThumbs(track, snap)
    }

    return {
        paint: paintFilmstrip,
        stampGeometry: stampFilmstripGeometry,
        centerCurrent: centerCurrentThumb,
        paintedThumbIds,
        morph: filmstripMorph,
        withMetrics: withFilmstripMetrics,
        refreshThumbsAfterSettle,
        destroy: removeFilmstrip,
    }
}
