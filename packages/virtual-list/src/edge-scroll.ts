import type { LoadDirection } from "./slice"

export const DEFAULT_SENSITIVE_AREA_PX: number = 800
export const DEFAULT_EDGE_DEBOUNCE_MS: number = 150
export const DEFAULT_IDLE_TRIM_MS: number = 150

export type EdgeScrollState = {
    isScrollTopJustUpdated?: boolean
    lastScrollTop?: number
}

export function leadingDebounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
    let lastCall = 0
    return (...args: A) => {
        let now = Date.now()
        if (now - lastCall < ms) return
        lastCall = now
        fn(...args)
    }
}

export function createEdgeDebouncedLoaders(
    onLoadMore: (args: { direction: LoadDirection; noScroll?: boolean }) => void,
    debounceMs: number = DEFAULT_EDGE_DEBOUNCE_MS,
): {
    loadMoreForwards: () => void
    loadMoreBackwards: (noScroll?: boolean) => void
} {
    let loadMoreForwards = leadingDebounce(() => {
        onLoadMore({ direction: "forwards" })
    }, debounceMs)
    let loadMoreBackwards = leadingDebounce((noScroll: boolean = false) => {
        onLoadMore({ direction: "backwards", noScroll })
    }, debounceMs)
    return { loadMoreForwards, loadMoreBackwards }
}

export function handleEdgeScroll(args: {
    scrollTop: number
    viewportHeight: number
    itemHeight: number
    fromOffset: number
    mountedCount: number
    sensitiveArea: number
    state: EdgeScrollState
    loadMoreForwards: () => void
    loadMoreBackwards: (noScroll?: boolean) => void
    mountedTopPx?: number
    mountedBottomPx?: number
}): boolean {
    let {
        scrollTop,
        viewportHeight,
        itemHeight,
        fromOffset,
        mountedCount,
        sensitiveArea,
        state,
        loadMoreForwards,
        loadMoreBackwards,
        mountedTopPx,
        mountedBottomPx,
    } = args

    if (state.isScrollTopJustUpdated) {
        state.isScrollTopJustUpdated = false
        state.lastScrollTop = scrollTop
        return false
    }

    if (itemHeight <= 0 || mountedCount <= 0 || viewportHeight <= 0) {
        state.lastScrollTop = scrollTop
        return false
    }

    let lastScrollTop = state.lastScrollTop
    if (lastScrollTop === undefined) {
        state.lastScrollTop = scrollTop
        return false
    }

    let topPx = mountedTopPx ?? fromOffset * itemHeight
    let bottomPx = mountedBottomPx ?? (fromOffset + mountedCount) * itemHeight
    let nearTop = scrollTop <= topPx + sensitiveArea
    let nearBottom = bottomPx - (scrollTop + viewportHeight) <= sensitiveArea
    let movingUp = scrollTop < lastScrollTop
    let movingDown = scrollTop > lastScrollTop

    let fired = false
    if (movingUp && nearTop) {
        loadMoreForwards()
        fired = true
    } else if (movingDown && nearBottom) {
        loadMoreBackwards()
        fired = true
    }

    state.lastScrollTop = scrollTop
    return fired
}

export function maybePreloadBackwards(args: {
    itemCount: number
    preloadBackwards: number
    loadMoreBackwards: (noScroll?: boolean) => void
    itemHeight?: number
    viewportHeight?: number
    scrollContainer?: HTMLElement | null
}): boolean {
    let { itemCount, preloadBackwards, loadMoreBackwards, itemHeight, viewportHeight, scrollContainer } = args

    if (preloadBackwards > 0 && itemCount < preloadBackwards) {
        loadMoreBackwards(true)
        return true
    }

    if (
        itemHeight !== undefined &&
        viewportHeight !== undefined &&
        itemHeight > 0 &&
        viewportHeight > 0 &&
        itemCount * itemHeight < viewportHeight
    ) {
        loadMoreBackwards()
        return true
    }

    if (scrollContainer != null) {
        let { scrollHeight, clientHeight } = scrollContainer
        if (scrollHeight > 0 && clientHeight > 0 && scrollHeight < clientHeight) {
            loadMoreBackwards()
            return true
        }
    }

    return false
}
