import type { MediaDecodeBudget, MediaDecodeRequest } from "./decode"

export type MediaKind = "image" | "video" | "gif"

export type MediaViewerItem = {
    id: string
    kind: MediaKind
    src?: string | null
    poster?: string | null
    alt?: string
    naturalWidth?: number
    naturalHeight?: number
}

export type MediaViewerNeighbor = {
    id: string
    kind: MediaKind
    src?: string | null
    poster?: string | null
}

export type MediaViewerOrigin = {
    id: string
    rect: { top: number; left: number; width: number; height: number }
    imageUrl: string | null
    objectFit: "cover" | "contain"
    naturalWidth?: number
    naturalHeight?: number
}

export type MediaViewerNavFrom = "key" | "swipe" | "jump" | "prev" | "next"

export type MediaViewerChromeApi = {
    close: (opts?: { ghost?: boolean }) => void
    forceClose: () => void
    prev: () => void
    next: () => void
    goTo: (index: number) => void
    zoomIn: () => void
    zoomOut: () => void
    resetZoom: () => void
    percentLabel: () => string
    scale: () => number
    onZoomChange: (listener: () => void) => () => void
    isGesturing: () => boolean
    snapshot: () => MediaViewerSnapshot
}

export type MediaViewerChrome = (container: HTMLElement, api: MediaViewerChromeApi) => void | (() => void)

export type MediaViewerChromeSlots = {
    header?: MediaViewerChrome
    footer?: MediaViewerChrome
    overlay?: MediaViewerChrome
}

export type FilmstripItemSizes = {
    neighbor: number
    current: number
}

export type MediaFilmstripOpts = {
    virtualize?: boolean
    itemSizePx?: number | FilmstripItemSizes
    overscan?: number
}

export type MediaViewerOpenOpts = {
    items: readonly MediaViewerItem[]
    index?: number
    origin?: MediaViewerOrigin | null
    ghost?: boolean
    filmstrip?: boolean | MediaFilmstripOpts
    filmstripThumbSrc?: (item: MediaViewerItem) => string | null
    /** CSS length for strip max width (`36%`, `100%`, `24rem`). Default compact. */
    filmstripMaxWidth?: string
    neighbors?: { older: MediaViewerNeighbor | null; newer: MediaViewerNeighbor | null }
    canOlder?: boolean
    canNewer?: boolean
    chrome?: MediaViewerChromeSlots
}

export type MediaViewerSnapshot = {
    open: boolean
    items: readonly MediaViewerItem[]
    index: number
    current: MediaViewerItem | null
    neighbors: { older: MediaViewerNeighbor | null; newer: MediaViewerNeighbor | null }
    canOlder: boolean
    canNewer: boolean
    origin: MediaViewerOrigin | null
    ghost: boolean
    filmstrip: boolean
    filmstripMaxWidth: string
}

export type MediaVisibleIds = {
    stage: string
    peeks: string[]
    thumbs: string[]
}

export type MediaViewerSessionOpts = {
    onClose?: () => void
    onIndexChange?: (index: number, item: MediaViewerItem) => void
    onRequestOlder?: () => void
    onRequestNewer?: () => void
    prefersReducedMotion?: () => boolean
    decode?: (req: MediaDecodeRequest) => Promise<CanvasImageSource | null>
    decodeBudget?: Partial<MediaDecodeBudget>
    onVisible?: (ids: MediaVisibleIds) => void
}

export type MediaViewer = {
    open: (opts: MediaViewerOpenOpts) => void
    beginClose: (opts?: { ghost?: boolean }) => boolean
    close: () => void
    forceClose: () => void
    setItems: (items: readonly MediaViewerItem[], index?: number) => void
    setNeighbors: (neighbors: { older: MediaViewerNeighbor | null; newer: MediaViewerNeighbor | null }) => void
    setCanNav: (can: { older?: boolean; newer?: boolean }) => void
    prev: (from?: MediaViewerNavFrom) => void
    next: (from?: MediaViewerNavFrom) => void
    goTo: (index: number) => void
    setFilmstrip: (on: boolean) => void
    setFilmstripMaxWidth: (width: string) => void
    filmstripVirtualize: () => boolean
    filmstripItemSizePx: () => number
    filmstripItemSizes: () => FilmstripItemSizes
    filmstripOverscan: () => number
    filmstripThumbSrc: () => ((item: MediaViewerItem) => string | null) | undefined
    chrome: () => MediaViewerChromeSlots | null
    lastNav: () => MediaViewerNavFrom | null
    wantsGhost: (kind: "open" | "close") => boolean
    subscribe: (listener: () => void) => () => void
    snapshot: () => MediaViewerSnapshot
    decodeFn: () => ((req: MediaDecodeRequest) => Promise<CanvasImageSource | null>) | undefined
    decodeBudget: () => MediaDecodeBudget
    isGesturing: () => boolean
    setGesturing: (on: boolean) => void
    notifyVisible: (ids: MediaVisibleIds) => void
    destroy: () => void
}
