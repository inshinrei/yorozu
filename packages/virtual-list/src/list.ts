import {
    DEFAULT_EDGE_DEBOUNCE_MS,
    DEFAULT_IDLE_TRIM_MS,
    DEFAULT_SENSITIVE_AREA_PX,
    createEdgeDebouncedLoaders,
    handleEdgeScroll,
    maybePreloadBackwards,
    type EdgeScrollState,
} from "./edge-scroll"
import {
    firstVisibleIndexFromPrefix,
    heightPrefix,
    listSliceForViewport,
    paintedIndexRange,
    rowTopFromPrefix,
} from "./range"
import { DEFAULT_LIST_SLICE, ViewportIdSliceController, areIdArraysEqual, type LoadDirection } from "./slice"

export type VirtualListRange = {
    start: number
    end: number
}

export type VirtualListOptions<Id extends string | number> = {
    getItems: () => readonly Id[]
    itemSize: number | ((index: number) => number)
    listSlice?: number
    sensitiveArea?: number
    edgeDebounceMs?: number
    idleTrimMs?: number
    nearEndThreshold?: number
    loadMoreBackwards?: (args: { offsetId?: Id }) => void
    onNearEnd?: () => void
    onVisibleRange?: (range: VirtualListRange) => void
    onPaintedRange?: (range: VirtualListRange) => void
    onChange?: () => void
    getFromTranslateY?: (key: string | number) => number | undefined
    scheduleIdle?: (fn: () => void, timeoutMs: number) => { cancel(): void }
}

export type VirtualList<Id extends string | number> = {
    viewportIds: () => Id[] | undefined
    fromOffset: () => number
    isOnTop: () => boolean
    totalSize: () => number
    rowTop: (index: number) => number
    rowHeight: (index: number) => number
    slotIndex: (id: Id) => number | undefined
    fromTranslateY: (key: string | number) => number | undefined
    sync: (isDisabled?: boolean) => boolean
    onScroll: (metrics: { scrollTop: number; viewportHeight: number }) => void
    reanchor: (index: number) => void
    resetToTop: () => void
    getMore: (direction: LoadDirection, noScroll?: boolean) => boolean
    trimIdle: (firstVisibleIndex: number) => boolean
    setListSlice: (n: number) => void
    destroy: () => void
}

type IdleHandle = { cancel(): void }

const DEFAULT_NEAR_END_THRESHOLD: number = 10

function defaultScheduleIdle(fn: () => void, timeoutMs: number): IdleHandle {
    let timer = setTimeout(fn, timeoutMs)
    return {
        cancel(): void {
            clearTimeout(timer)
        },
    }
}

function exclusiveEndFromPrefix(prefix: number[], viewportBottom: number): number {
    let count = prefix.length - 1
    if (count <= 0 || viewportBottom <= 0) return 0
    let lo = 0
    let hi = count
    while (lo < hi) {
        let mid = (lo + hi) >>> 1
        if (prefix[mid]! >= viewportBottom) {
            hi = mid
        } else {
            lo = mid + 1
        }
    }
    return lo
}

export function createVirtualList<Id extends string | number>(options: VirtualListOptions<Id>): VirtualList<Id> {
    let listSlice = options.listSlice ?? DEFAULT_LIST_SLICE
    let sensitiveArea = options.sensitiveArea ?? DEFAULT_SENSITIVE_AREA_PX
    let idleTrimMs = options.idleTrimMs ?? DEFAULT_IDLE_TRIM_MS
    let nearEndThreshold = options.nearEndThreshold ?? DEFAULT_NEAR_END_THRESHOLD
    let scheduleIdle = options.scheduleIdle ?? defaultScheduleIdle

    let controller = new ViewportIdSliceController<Id>({
        listSlice: options.listSlice,
        loadMoreBackwards: options.loadMoreBackwards,
    })

    let slots = new Map<Id, number>()
    let prefix: number[] | undefined
    let lastScrollTop = 0
    let lastViewportHeight: number | undefined
    let lastPainted: VirtualListRange | undefined
    let lastNearEndLength: number | undefined
    let idleHandle: IdleHandle | undefined
    let edgeState: EdgeScrollState = {}

    let { loadMoreForwards, loadMoreBackwards } = createEdgeDebouncedLoaders((args) => {
        getMore(args.direction, args.noScroll)
    }, options.edgeDebounceMs ?? DEFAULT_EDGE_DEBOUNCE_MS)

    function sourceIds(): Id[] {
        return options.getItems().slice()
    }

    function viewportIds(): Id[] | undefined {
        return controller.viewportIds
    }

    function fromOffset(): number {
        return controller.fromOffset
    }

    function isOnTop(): boolean {
        return controller.isOnTop
    }

    function totalSize(): number {
        let itemSize = options.itemSize
        if (typeof itemSize === "number") {
            return options.getItems().length * itemSize
        }
        if (prefix === undefined || prefix.length === 0) return 0
        return prefix[prefix.length - 1]!
    }

    function rowTop(index: number): number {
        let itemSize = options.itemSize
        if (typeof itemSize === "number") return index * itemSize
        if (prefix === undefined) return 0
        return rowTopFromPrefix(prefix, index)
    }

    function rowHeight(index: number): number {
        let itemSize = options.itemSize
        if (typeof itemSize === "number") return itemSize
        if (prefix === undefined) return 0
        let top = prefix[index]
        let next = prefix[index + 1]
        if (top === undefined || next === undefined) return 0
        return next - top
    }

    function slotIndex(id: Id): number | undefined {
        return slots.get(id)
    }

    function fromTranslateY(key: string | number): number | undefined {
        return options.getFromTranslateY?.(key)
    }

    function firstVisibleIndex(): number {
        let count = options.getItems().length
        if (count <= 0) return 0
        let itemSize = options.itemSize
        if (typeof itemSize === "number") {
            if (itemSize <= 0) return 0
            return Math.max(0, Math.min(count - 1, Math.floor(lastScrollTop / itemSize)))
        }
        if (prefix === undefined) return 0
        return firstVisibleIndexFromPrefix(prefix, lastScrollTop)
    }

    function reassignSlots(): void {
        let ids = controller.viewportIds
        if (ids === undefined) {
            slots.clear()
            return
        }
        let mounted = new Set(ids)
        for (let id of [...slots.keys()]) {
            if (!mounted.has(id)) slots.delete(id)
        }
        let used = new Set(slots.values())
        for (let id of ids) {
            if (slots.has(id)) continue
            let slot = 0
            while (used.has(slot)) slot++
            slots.set(id, slot)
            used.add(slot)
        }
    }

    function notify(): void {
        reassignSlots()
        let mountedCount = controller.viewportIds?.length ?? 0
        options.onVisibleRange?.({
            start: controller.fromOffset,
            end: controller.fromOffset + mountedCount,
        })
        options.onChange?.()
    }

    function notifyIfChanged(changed: boolean): boolean {
        if (changed) notify()
        return changed
    }

    function preloadIfNeeded(): void {
        if (lastViewportHeight === undefined || lastViewportHeight <= 0) return
        let itemSize = options.itemSize
        let itemHeight = typeof itemSize === "number" ? itemSize : rowHeight(0)
        maybePreloadBackwards({
            itemCount: controller.viewportIds?.length ?? 0,
            preloadBackwards: listSlice,
            loadMoreBackwards,
            itemHeight,
            viewportHeight: lastViewportHeight,
        })
    }

    function cancelIdle(): void {
        idleHandle?.cancel()
        idleHandle = undefined
    }

    function applyIdleTrim(): void {
        let itemSize = options.itemSize
        if (typeof itemSize === "number" && lastViewportHeight !== undefined && lastViewportHeight > 0) {
            let nextSlice = listSliceForViewport(lastViewportHeight, itemSize)
            listSlice = nextSlice
            controller.setListSlice(nextSlice)
        }
        notifyIfChanged(controller.trimToSlice(sourceIds(), firstVisibleIndex()))
    }

    function scheduleIdleTrim(): void {
        cancelIdle()
        idleHandle = scheduleIdle(() => {
            idleHandle = undefined
            applyIdleTrim()
        }, idleTrimMs)
    }

    function firePaintedRange(scrollTop: number, viewportHeight: number): void {
        let onPaintedRange = options.onPaintedRange
        if (onPaintedRange === undefined) return
        let count = options.getItems().length
        let itemSize = options.itemSize
        let range: VirtualListRange
        if (typeof itemSize === "number") {
            range = paintedIndexRange(scrollTop, viewportHeight, itemSize, count)
        } else if (prefix === undefined || viewportHeight <= 0 || count <= 0) {
            range = { start: 0, end: 0 }
        } else {
            range = {
                start: firstVisibleIndexFromPrefix(prefix, scrollTop),
                end: exclusiveEndFromPrefix(prefix, scrollTop + viewportHeight),
            }
        }
        if (lastPainted !== undefined && lastPainted.start === range.start && lastPainted.end === range.end) {
            return
        }
        lastPainted = range
        onPaintedRange(range)
    }

    function maybeFireNearEnd(count: number): void {
        let onNearEnd = options.onNearEnd
        if (onNearEnd === undefined) return
        let mountedEnd = controller.fromOffset + (controller.viewportIds?.length ?? 0)
        if (mountedEnd >= count - nearEndThreshold) {
            if (lastNearEndLength !== count) {
                lastNearEndLength = count
                onNearEnd()
            }
        } else {
            lastNearEndLength = undefined
        }
    }

    function sync(isDisabled?: boolean): boolean {
        let source = sourceIds()
        let itemSize = options.itemSize
        if (typeof itemSize === "function") {
            prefix = heightPrefix(source.length, itemSize)
        }
        let changed = controller.sync(source, isDisabled)
        notifyIfChanged(changed)
        preloadIfNeeded()
        return changed
    }

    function onScroll(metrics: { scrollTop: number; viewportHeight: number }): void {
        lastScrollTop = metrics.scrollTop
        lastViewportHeight = metrics.viewportHeight

        firePaintedRange(metrics.scrollTop, metrics.viewportHeight)

        let source = sourceIds()
        let count = source.length
        let from = controller.fromOffset
        let mountedCount = controller.viewportIds?.length ?? 0
        let first = firstVisibleIndex()
        if (first < from - 2 || first >= from + mountedCount + 2) {
            let changed = controller.reanchorAtIndex(source, first)
            edgeState.lastScrollTop = undefined
            scheduleIdleTrim()
            notifyIfChanged(changed)
            return
        }

        let windowEnd = from + mountedCount
        let itemSize = options.itemSize
        handleEdgeScroll({
            scrollTop: metrics.scrollTop,
            viewportHeight: metrics.viewportHeight,
            itemHeight: typeof itemSize === "number" ? itemSize : rowHeight(0),
            fromOffset: from,
            mountedCount,
            sensitiveArea,
            state: edgeState,
            loadMoreForwards,
            loadMoreBackwards,
            mountedTopPx: rowTop(from),
            mountedBottomPx: windowEnd >= count ? totalSize() : rowTop(windowEnd),
        })

        scheduleIdleTrim()
        maybeFireNearEnd(count)
    }

    function reanchor(index: number): void {
        notifyIfChanged(controller.reanchorAtIndex(sourceIds(), index))
    }

    function resetToTop(): void {
        let prevIds = controller.viewportIds
        let prevFrom = controller.fromOffset
        let prevOnTop = controller.isOnTop
        controller.resetToTop(sourceIds())
        edgeState.isScrollTopJustUpdated = true
        edgeState.lastScrollTop = undefined
        let changed =
            !areIdArraysEqual(prevIds, controller.viewportIds) ||
            prevFrom !== controller.fromOffset ||
            prevOnTop !== controller.isOnTop
        notifyIfChanged(changed)
    }

    function getMore(direction: LoadDirection, noScroll?: boolean): boolean {
        return notifyIfChanged(controller.getMore(sourceIds(), { direction, noScroll }))
    }

    function trimIdle(firstVisible: number): boolean {
        return notifyIfChanged(controller.trimToSlice(sourceIds(), firstVisible))
    }

    function setListSlice(n: number): void {
        if (n <= 0) return
        listSlice = n
        controller.setListSlice(n)
    }

    function destroy(): void {
        cancelIdle()
    }

    return {
        viewportIds,
        fromOffset,
        isOnTop,
        totalSize,
        rowTop,
        rowHeight,
        slotIndex,
        fromTranslateY,
        sync,
        onScroll,
        reanchor,
        resetToTop,
        getMore,
        trimIdle,
        setListSlice,
        destroy,
    }
}
