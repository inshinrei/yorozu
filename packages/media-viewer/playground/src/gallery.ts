import { MEDIA_ORIGIN_ATTR, type MediaViewerItem } from "@yorozu/media-viewer"
import {
    albumRatiosFromSizes,
    calculateAlbumLayoutByRatios,
    DEFAULT_ALBUM_MAX_WIDTH,
    DEFAULT_ALBUM_SPACING,
} from "./album-layout"

export const ALBUM_CYCLE_SIZES: number[] = [1, 2, 3, 4, 5, 6, 10]

export const EMPTY_MEDIA_HINT: string = "No media yet — add playground/public/media/manifest.json"

/** Packer width: fill the host when measured, else the default token. */
export function albumMaxWidth(availableWidth: number): number {
    return availableWidth > 0 ? Math.floor(availableWidth) : DEFAULT_ALBUM_MAX_WIDTH
}

export type ManifestMedia = {
    id: string
    src: string
    width?: number | null
    height?: number | null
    poster?: string | null
}

export type MediaManifest = {
    images: ManifestMedia[]
    videos: ManifestMedia[]
}

export type GalleryOpenHandler = (items: MediaViewerItem[], index: number, id: string) => void

export type MountGalleryOpts = {
    images?: ReadonlyArray<ManifestMedia>
    videos?: ReadonlyArray<ManifestMedia>
    onOpen: GalleryOpenHandler
}

function asMediaList(value: unknown): ManifestMedia[] {
    if (!Array.isArray(value)) return []
    let out: ManifestMedia[] = []
    for (let row of value) {
        if (row == null || typeof row !== "object") continue
        let rec = row as Record<string, unknown>
        if (typeof rec.id !== "string" || typeof rec.src !== "string") continue
        let entry: ManifestMedia = { id: rec.id, src: rec.src }
        if (typeof rec.width === "number") entry.width = rec.width
        if (typeof rec.height === "number") entry.height = rec.height
        if (typeof rec.poster === "string") entry.poster = rec.poster
        out.push(entry)
    }
    return out
}

export async function loadMediaManifest(url: string = "/media/manifest.json"): Promise<MediaManifest> {
    try {
        let res = await fetch(url)
        if (!res.ok) return { images: [], videos: [] }
        let data: unknown = await res.json()
        if (data == null || typeof data !== "object") return { images: [], videos: [] }
        let rec = data as Record<string, unknown>
        return { images: asMediaList(rec.images), videos: asMediaList(rec.videos) }
    } catch {
        return { images: [], videos: [] }
    }
}

function toViewerItem(entry: ManifestMedia, kind: MediaViewerItem["kind"]): MediaViewerItem {
    let item: MediaViewerItem = {
        id: entry.id,
        kind,
        src: entry.src,
    }
    if (kind === "video" && entry.poster) item.poster = entry.poster
    if (entry.width && entry.width > 0) item.naturalWidth = entry.width
    if (entry.height && entry.height > 0) item.naturalHeight = entry.height
    return item
}

function groupIntoAlbums<T>(items: readonly T[]): T[][] {
    let albums: T[][] = []
    let offset = 0
    let sizeIndex = 0
    while (offset < items.length) {
        let size = ALBUM_CYCLE_SIZES[sizeIndex % ALBUM_CYCLE_SIZES.length] ?? 1
        let next = items.slice(offset, offset + size)
        albums.push(next)
        offset += next.length
        sizeIndex += 1
    }
    return albums
}

function cellPercentStyle(
    cell: { dimensions: { x: number; y: number; width: number; height: number } },
    container: { width: number; height: number },
): string {
    let cw = container.width
    let ch = container.height
    if (!(cw > 0) || !(ch > 0)) return ""
    let { x, y, width, height } = cell.dimensions
    return `left:${(x / cw) * 100}%;top:${(y / ch) * 100}%;width:${(width / cw) * 100}%;height:${(height / ch) * 100}%`
}

function renderThumb(item: MediaViewerItem, entry: ManifestMedia): HTMLElement {
    let kind = item.kind
    if (kind === "video" && !entry.poster) {
        let video = document.createElement("video")
        video.src = entry.src
        video.muted = true
        video.playsInline = true
        video.preload = "metadata"
        video.setAttribute(MEDIA_ORIGIN_ATTR, item.id)
        video.style.objectFit = "cover"
        return video
    }
    let img = document.createElement("img")
    img.src = kind === "video" ? (entry.poster ?? entry.src) : entry.src
    img.alt = ""
    img.draggable = false
    img.loading = "lazy"
    img.setAttribute(MEDIA_ORIGIN_ATTR, item.id)
    img.style.objectFit = "cover"
    return img
}

function renderCell(
    item: MediaViewerItem,
    entry: ManifestMedia,
    style: string,
    onClick: () => void,
): HTMLButtonElement {
    let cell = document.createElement("button")
    cell.type = "button"
    cell.className = "pg-cell"
    cell.style.cssText = style
    cell.setAttribute("aria-label", item.kind === "video" ? `Play ${item.id}` : item.id)
    cell.append(renderThumb(item, entry))
    if (item.kind === "video") {
        let badge = document.createElement("span")
        badge.className = "pg-play"
        badge.setAttribute("aria-hidden", "true")
        cell.append(badge)
    }
    cell.addEventListener("click", onClick)
    return cell
}

function renderAlbum(
    entries: ManifestMedia[],
    items: MediaViewerItem[],
    startIndex: number,
    onOpen: GalleryOpenHandler,
    availableWidth: number,
): HTMLElement {
    let album = document.createElement("div")
    album.className = "pg-album"
    let ratios = albumRatiosFromSizes(entries)
    let maxWidth = albumMaxWidth(availableWidth)
    let { layout, containerStyle } = calculateAlbumLayoutByRatios(ratios, {
        maxWidth,
        maxHeight: maxWidth,
        spacing: DEFAULT_ALBUM_SPACING,
    })
    if (!(containerStyle.width > 0) || !(containerStyle.height > 0)) return album
    album.style.width = `${containerStyle.width}px`
    album.style.maxWidth = "100%"
    album.style.aspectRatio = `${containerStyle.width} / ${containerStyle.height}`
    for (let i = 0; i < entries.length; i++) {
        let entry = entries[i]
        let item = items[startIndex + i]
        let cell = layout[i]
        if (!entry || !item || !cell) continue
        let index = startIndex + i
        album.append(
            renderCell(item, entry, cellPercentStyle(cell, containerStyle), () => {
                onOpen(items, index, item.id)
            }),
        )
    }
    return album
}

export function mountGallery(host: HTMLElement, opts: MountGalleryOpts): () => void {
    let images = opts.images ?? []
    let videos = opts.videos ?? []
    let entries: ManifestMedia[] = [...images, ...videos]
    let items: MediaViewerItem[] = [
        ...images.map((entry) => toViewerItem(entry, "image")),
        ...videos.map((entry) => toViewerItem(entry, "video")),
    ]

    function paint(): void {
        host.replaceChildren()
        if (entries.length === 0) {
            let empty = document.createElement("p")
            empty.className = "pg-empty"
            empty.textContent = EMPTY_MEDIA_HINT
            host.append(empty)
        }
        let grid = document.createElement("div")
        grid.className = "pg-albums"
        host.append(grid)
        let width = albumMaxWidth(host.clientWidth)
        let albums = groupIntoAlbums(entries)
        let offset = 0
        for (let group of albums) {
            grid.append(renderAlbum(group, items, offset, opts.onOpen, width))
            offset += group.length
        }
    }

    paint()
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver === "function") {
        observer = new ResizeObserver(() => paint())
        observer.observe(host)
    }
    return () => {
        observer?.disconnect()
        observer = null
        host.replaceChildren()
    }
}
