import { computeAutoScrollDelta, computeAutoScrollDeltaX } from "./auto-scroll-geometry"
import type { SortableAxis } from "./geometry"

export const AUTO_SCROLL_ZONE_PX: number = 60
export const AUTO_SCROLL_MAX_PX_PER_FRAME: number = 18

export function pointerOnAxis(axis: SortableAxis, clientX: number, clientY: number): number {
    return axis === "y" ? clientY : clientX
}

function readAxisScroll(el: HTMLElement, axis: SortableAxis): number {
    return axis === "y" ? el.scrollTop : el.scrollLeft
}

function writeAxisScroll(el: HTMLElement, axis: SortableAxis, next: number): void {
    if (axis === "y") el.scrollTop = next
    else el.scrollLeft = next
}

function freezeAxisScrollMax(el: HTMLElement, axis: SortableAxis): number {
    if (axis === "y") return Math.max(0, el.scrollHeight - el.clientHeight)
    return Math.max(0, el.scrollWidth - el.clientWidth)
}

function clientSpan(el: HTMLElement, axis: SortableAxis): number {
    return axis === "y" ? el.clientHeight : el.clientWidth
}

function viewportDelta(
    axis: SortableAxis,
    pointer: number,
    viewport: HTMLElement,
    zone: number,
    maxStep: number,
): number {
    let rect = viewport.getBoundingClientRect()
    if (axis === "y") return computeAutoScrollDelta(pointer, rect, zone, maxStep)
    return computeAutoScrollDeltaX(pointer, rect, zone, maxStep)
}

export type SortableAutoScroll = {
    begin(viewport: HTMLElement | null): void
    kick(): void
    stop(): void
    get scrollDelta(): number
}

export function createSortableAutoScroll(opts: {
    axis: SortableAxis
    zone: number
    maxStep: number
    getPointer: () => number
    isDragging: () => boolean
    onScrolled: (scrollDelta: number) => void
}): SortableAutoScroll {
    let viewport: HTMLElement | null = null
    let startScroll = 0
    let scrollMaxAtStart = 0
    let scrollDelta = 0
    let frame: number | null = null

    function stop(): void {
        if (frame != null) {
            cancelAnimationFrame(frame)
            frame = null
        }
    }

    function clamp(next: number): number {
        return Math.max(0, Math.min(scrollMaxAtStart, next))
    }

    function step(): void {
        if (!opts.isDragging() || !viewport) {
            stop()
            return
        }
        let vp = viewport
        let delta = viewportDelta(opts.axis, opts.getPointer(), vp, opts.zone, opts.maxStep)
        let applied = false
        if (delta !== 0) {
            let cur = readAxisScroll(vp, opts.axis)
            let next = clamp(cur + delta)
            if (next !== cur) {
                writeAxisScroll(vp, opts.axis, next)
                applied = true
            }
            if (readAxisScroll(vp, opts.axis) > scrollMaxAtStart) {
                writeAxisScroll(vp, opts.axis, scrollMaxAtStart)
            }
            scrollDelta = readAxisScroll(vp, opts.axis) - startScroll
            opts.onScrolled(scrollDelta)
        }
        if (opts.isDragging() && applied && clientSpan(vp, opts.axis) >= 5) {
            frame = requestAnimationFrame(step)
        } else {
            frame = null
        }
    }

    function kick(): void {
        if (frame != null || !opts.isDragging() || !viewport) return
        if (clientSpan(viewport, opts.axis) < 5) return
        if (viewportDelta(opts.axis, opts.getPointer(), viewport, opts.zone, opts.maxStep) === 0) return
        frame = requestAnimationFrame(step)
    }

    function begin(next: HTMLElement | null): void {
        stop()
        viewport = next
        startScroll = next ? readAxisScroll(next, opts.axis) : 0
        scrollMaxAtStart = next ? freezeAxisScrollMax(next, opts.axis) : 0
        scrollDelta = 0
    }

    return {
        begin,
        kick,
        stop,
        get scrollDelta(): number {
            return scrollDelta
        },
    }
}
