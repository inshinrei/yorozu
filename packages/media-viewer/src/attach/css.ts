import { DEFAULT_MEDIA_INSETS } from "../ghost"
import type { MediaViewerItem, MediaViewerNeighbor } from "../types"

export const TAP_MOVE_PX: number = 10

export type FilmstripMetrics = {
    neighborWidth: number
    height: number
    cap: number
    gap: number
    currentGap: number
}

export function isZoomable(item: MediaViewerItem | MediaViewerNeighbor | null | undefined): boolean {
    return item?.kind === "image"
}

export function paddingPx(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === "") return fallback
    let n = parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
}

export function rootFontSizePx(): number {
    if (typeof document === "undefined" || typeof getComputedStyle !== "function") return 16
    let n = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return Number.isFinite(n) && n > 0 ? n : 16
}

export function parseCssLengthPx(raw: string, rootFontSize: number): number | null {
    let match = /^(-?\d+(?:\.\d+)?)(px|rem)$/i.exec(raw.trim())
    if (!match) return null
    let n = Number.parseFloat(match[1]!)
    if (!Number.isFinite(n)) return null
    if (match[2]!.toLowerCase() === "rem") n *= rootFontSize
    return n
}

export function tokenLengthPx(
    style: CSSStyleDeclaration | null,
    name: string,
    fallback: number,
    rootFontSize: number,
): number {
    if (style == null) return fallback
    let parsed = parseCssLengthPx(style.getPropertyValue(name), rootFontSize)
    return parsed == null ? fallback : parsed
}

export function readPadding(el: HTMLElement): { top: number; right: number; bottom: number; left: number } {
    let style = typeof getComputedStyle === "function" ? getComputedStyle(el) : null
    return {
        top: paddingPx(style?.paddingTop, DEFAULT_MEDIA_INSETS.top),
        right: paddingPx(style?.paddingRight, DEFAULT_MEDIA_INSETS.right),
        bottom: paddingPx(style?.paddingBottom, DEFAULT_MEDIA_INSETS.bottom),
        left: paddingPx(style?.paddingLeft, DEFAULT_MEDIA_INSETS.left),
    }
}

export function viewportFallback(): { width: number; height: number } {
    if (typeof window === "undefined") return { width: 800, height: 800 }
    return { width: window.innerWidth || 800, height: window.innerHeight || 800 }
}
