import { bindMediaViewerKeys } from "../keyboard"
import type { MediaViewer, MediaViewerChrome, MediaViewerChromeApi, MediaViewerSnapshot } from "../types"
import type { MediaImageZoom } from "../zoom-controller"
import { isZoomable } from "./css"

export type AttachChrome = {
    api: MediaViewerChromeApi
    sync: () => void
    unmountAll: () => void
    bindKeys: () => void
    unbindKeys: () => void
}

type SlotName = "header" | "footer" | "overlay"

export function createChrome(opts: {
    getHeader: () => HTMLElement | null
    getFooter: () => HTMLElement | null
    getChromeEl: () => HTMLElement | null
    viewer: MediaViewer
    zoom: MediaImageZoom
    requestClose: (closeOpts?: { ghost?: boolean }) => void
    forceClose: () => void
    scheduleRender: () => void
    openPhase: () => "opening" | "open" | "closing" | null
}): AttachChrome {
    let mounted: { header?: MediaViewerChrome; footer?: MediaViewerChrome; overlay?: MediaViewerChrome } = {}
    let unmounts: { header?: () => void; footer?: () => void; overlay?: () => void } = {}
    // Zoom lives for attach; chrome remounts each open. Track overlay-scoped unsubs.
    let chromeZoomUnsubs: (() => void)[] = []
    let unbind: (() => void) | null = null

    let api: MediaViewerChromeApi = {
        close: (closeOpts?: { ghost?: boolean }): void => {
            opts.requestClose(closeOpts)
        },
        forceClose: (): void => {
            opts.forceClose()
        },
        prev: (): void => {
            opts.viewer.prev("prev")
        },
        next: (): void => {
            opts.viewer.next("next")
        },
        goTo: (index: number): void => {
            opts.viewer.goTo(index)
        },
        zoomIn: (): void => {
            if (!isZoomable(opts.viewer.snapshot().current)) return
            opts.zoom.zoomIn()
            opts.scheduleRender()
        },
        zoomOut: (): void => {
            if (!isZoomable(opts.viewer.snapshot().current)) return
            opts.zoom.zoomOut()
            opts.scheduleRender()
        },
        resetZoom: (): void => {
            if (!isZoomable(opts.viewer.snapshot().current)) return
            opts.zoom.reset()
            opts.scheduleRender()
        },
        percentLabel: (): string => opts.zoom.percentLabel(),
        scale: (): number => opts.zoom.scale(),
        onZoomChange: (listener: () => void): (() => void) => {
            let unsub = opts.zoom.onChange(listener)
            chromeZoomUnsubs.push(unsub)
            return (): void => {
                unsub()
                let i = chromeZoomUnsubs.indexOf(unsub)
                if (i >= 0) chromeZoomUnsubs.splice(i, 1)
            }
        },
        isGesturing: (): boolean => opts.viewer.isGesturing(),
        snapshot: (): MediaViewerSnapshot => opts.viewer.snapshot(),
    }

    function bindKeys(): void {
        if (unbind) return
        unbind = bindMediaViewerKeys({
            close: (): void => {
                opts.requestClose()
            },
            prev: (): void => {
                opts.viewer.prev("prev")
            },
            next: (): void => {
                opts.viewer.next("next")
            },
            zoomIn: (): void => {
                api.zoomIn()
            },
            zoomOut: (): void => {
                api.zoomOut()
            },
            resetZoom: (): void => {
                api.resetZoom()
            },
            getAllowSwitch: (): boolean => {
                if (!opts.viewer.snapshot().open) return false
                if (opts.openPhase() !== "open") return false
                let current = opts.viewer.snapshot().current
                if (isZoomable(current) && opts.zoom.isZoomed()) return false
                return true
            },
            getAllowZoom: (): boolean => isZoomable(opts.viewer.snapshot().current),
        })
    }

    function unbindKeys(): void {
        unbind?.()
        unbind = null
    }

    function slotEl(name: SlotName): HTMLElement | null {
        if (name === "header") return opts.getHeader()
        if (name === "footer") return opts.getFooter()
        return opts.getChromeEl()
    }

    function syncSlot(name: SlotName, fn: MediaViewerChrome | undefined): void {
        let el = slotEl(name)
        if (!el) return
        if (mounted[name] === fn) return
        unmounts[name]?.()
        unmounts[name] = undefined
        el.replaceChildren()
        mounted[name] = fn
        if (!fn) return
        let cleanup = fn(el, api)
        if (typeof cleanup === "function") unmounts[name] = cleanup
    }

    function flushChromeZoomUnsubs(): void {
        let pending = chromeZoomUnsubs
        chromeZoomUnsubs = []
        for (let unsub of pending) unsub()
    }

    function unmountAll(): void {
        flushChromeZoomUnsubs()
        syncSlot("header", undefined)
        syncSlot("footer", undefined)
        syncSlot("overlay", undefined)
        mounted = {}
        unmounts = {}
    }

    function sync(): void {
        let slots = opts.viewer.chrome()
        syncSlot("header", slots?.header)
        syncSlot("footer", slots?.footer)
        syncSlot("overlay", slots?.overlay)
    }

    return {
        api,
        sync,
        unmountAll,
        bindKeys,
        unbindKeys,
    }
}
