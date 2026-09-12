// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    createEdgeDebouncedLoaders,
    handleEdgeScroll,
    leadingDebounce,
    maybePreloadBackwards,
    type EdgeScrollState,
} from "./edge-scroll"

describe("leadingDebounce", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("runs the first call immediately and drops calls inside the window", () => {
        let fn = vi.fn()
        let d = leadingDebounce(fn, 1000)
        d()
        d()
        d()
        expect(fn).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(1000)
        d()
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it("runs the first call even when Date.now is 0", () => {
        vi.setSystemTime(0)
        let fn = vi.fn()
        let d = leadingDebounce(fn, 1000)
        d()
        expect(fn).toHaveBeenCalledTimes(1)
    })
})

describe("createEdgeDebouncedLoaders", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it("forwards and backwards call onLoadMore with direction", () => {
        let onLoadMore = vi.fn()
        let { loadMoreForwards, loadMoreBackwards } = createEdgeDebouncedLoaders(onLoadMore, 500)
        loadMoreForwards()
        loadMoreBackwards(true)
        expect(onLoadMore).toHaveBeenCalledWith({ direction: "forwards" })
        expect(onLoadMore).toHaveBeenCalledWith({ direction: "backwards", noScroll: true })
    })
})

describe("handleEdgeScroll (fixed-height math)", () => {
    let itemHeight = 72
    let viewportHeight = 300
    let sensitiveArea = 800

    it("skips one frame after programmatic scroll flag and seeds lastScrollTop", () => {
        let loadMoreForwards = vi.fn()
        let loadMoreBackwards = vi.fn()
        let state: EdgeScrollState = { isScrollTopJustUpdated: true }
        let updated = handleEdgeScroll({
            scrollTop: 0,
            viewportHeight,
            itemHeight,
            fromOffset: 0,
            mountedCount: 30,
            sensitiveArea,
            state,
            loadMoreForwards,
            loadMoreBackwards,
        })
        expect(updated).toBe(false)
        expect(loadMoreForwards).not.toHaveBeenCalled()
        expect(state.isScrollTopJustUpdated).toBe(false)
        expect(state.lastScrollTop).toBe(0)
    })

    it("does not load on first sample (no direction yet)", () => {
        let loadMoreForwards = vi.fn()
        let loadMoreBackwards = vi.fn()
        let state: EdgeScrollState = {}
        let updated = handleEdgeScroll({
            scrollTop: 100,
            viewportHeight,
            itemHeight,
            fromOffset: 0,
            mountedCount: 30,
            sensitiveArea,
            state,
            loadMoreForwards,
            loadMoreBackwards,
        })
        expect(updated).toBe(false)
        expect(loadMoreForwards).not.toHaveBeenCalled()
        expect(loadMoreBackwards).not.toHaveBeenCalled()
        expect(state.lastScrollTop).toBe(100)
    })

    it("loads forwards when near mounted top and scrollTop decreases", () => {
        let loadMoreForwards = vi.fn()
        let loadMoreBackwards = vi.fn()
        let state: EdgeScrollState = { lastScrollTop: 1600 }
        let updated = handleEdgeScroll({
            scrollTop: 1500,
            viewportHeight,
            itemHeight,
            fromOffset: 20,
            mountedCount: 30,
            sensitiveArea,
            state,
            loadMoreForwards,
            loadMoreBackwards,
        })
        expect(updated).toBe(true)
        expect(loadMoreForwards).toHaveBeenCalledTimes(1)
        expect(loadMoreBackwards).not.toHaveBeenCalled()
        expect(state.lastScrollTop).toBe(1500)
    })

    it("loads backwards when near mounted bottom and scrollTop increases", () => {
        let loadMoreForwards = vi.fn()
        let loadMoreBackwards = vi.fn()
        let state: EdgeScrollState = { lastScrollTop: 1000 }
        let updated = handleEdgeScroll({
            scrollTop: 1200,
            viewportHeight,
            itemHeight,
            fromOffset: 0,
            mountedCount: 30,
            sensitiveArea,
            state,
            loadMoreForwards,
            loadMoreBackwards,
        })
        expect(updated).toBe(true)
        expect(loadMoreBackwards).toHaveBeenCalledTimes(1)
        expect(loadMoreForwards).not.toHaveBeenCalled()
    })

    it("does not load when mid-window far from edges", () => {
        let loadMoreForwards = vi.fn()
        let loadMoreBackwards = vi.fn()
        let state: EdgeScrollState = { lastScrollTop: 2000 }
        let updated = handleEdgeScroll({
            scrollTop: 2100,
            viewportHeight: 200,
            itemHeight,
            fromOffset: 0,
            mountedCount: 100,
            sensitiveArea: 50,
            state,
            loadMoreForwards,
            loadMoreBackwards,
        })
        expect(updated).toBe(false)
        expect(loadMoreForwards).not.toHaveBeenCalled()
        expect(loadMoreBackwards).not.toHaveBeenCalled()
        expect(state.lastScrollTop).toBe(2100)
    })

    it("does not load when near edge but moving the wrong direction", () => {
        let loadMoreForwards = vi.fn()
        let loadMoreBackwards = vi.fn()
        let state: EdgeScrollState = { lastScrollTop: 1400 }
        let updated = handleEdgeScroll({
            scrollTop: 1500,
            viewportHeight,
            itemHeight,
            fromOffset: 20,
            mountedCount: 30,
            sensitiveArea,
            state,
            loadMoreForwards,
            loadMoreBackwards,
        })
        expect(updated).toBe(false)
        expect(loadMoreForwards).not.toHaveBeenCalled()
    })

    it("returns false for invalid geometry", () => {
        let state: EdgeScrollState = { lastScrollTop: 10 }
        expect(
            handleEdgeScroll({
                scrollTop: 20,
                viewportHeight: 300,
                itemHeight: 0,
                fromOffset: 0,
                mountedCount: 10,
                sensitiveArea: 100,
                state,
                loadMoreForwards: vi.fn(),
                loadMoreBackwards: vi.fn(),
            }),
        ).toBe(false)
        expect(state.lastScrollTop).toBe(20)

        state = { lastScrollTop: 10 }
        expect(
            handleEdgeScroll({
                scrollTop: 20,
                viewportHeight: 300,
                itemHeight: 72,
                fromOffset: 0,
                mountedCount: 0,
                sensitiveArea: 100,
                state,
                loadMoreForwards: vi.fn(),
                loadMoreBackwards: vi.fn(),
            }),
        ).toBe(false)
        expect(state.lastScrollTop).toBe(20)

        state = { lastScrollTop: 10 }
        expect(
            handleEdgeScroll({
                scrollTop: 20,
                viewportHeight: 0,
                itemHeight: 72,
                fromOffset: 0,
                mountedCount: 10,
                sensitiveArea: 100,
                state,
                loadMoreForwards: vi.fn(),
                loadMoreBackwards: vi.fn(),
            }),
        ).toBe(false)
        expect(state.lastScrollTop).toBe(20)
    })

    it("does not treat itemHeight 0 as invalid when mounted px are provided", () => {
        let forwards = vi.fn()
        let state: EdgeScrollState = { lastScrollTop: 2800 }
        handleEdgeScroll({
            scrollTop: 2700,
            viewportHeight: 100,
            itemHeight: 0,
            fromOffset: 0,
            mountedCount: 4,
            sensitiveArea: 800,
            state,
            loadMoreForwards: forwards,
            loadMoreBackwards: vi.fn(),
            mountedTopPx: 2000,
            mountedBottomPx: 2500,
        })
        expect(forwards).toHaveBeenCalled()
    })

    it("uses mountedTopPx/mountedBottomPx when provided", () => {
        let forwards = vi.fn()
        let backwards = vi.fn()
        let state: EdgeScrollState = { lastScrollTop: 2800 }
        handleEdgeScroll({
            scrollTop: 2700,
            viewportHeight: 100,
            itemHeight: 118,
            fromOffset: 0,
            mountedCount: 4,
            sensitiveArea: 800,
            state,
            loadMoreForwards: forwards,
            loadMoreBackwards: backwards,
            mountedTopPx: 2000,
            mountedBottomPx: 2500,
        })
        expect(forwards).toHaveBeenCalled()
    })
})

describe("maybePreloadBackwards", () => {
    it("preloads when item count is below preloadBackwards", () => {
        let load = vi.fn()
        expect(
            maybePreloadBackwards({
                itemCount: 5,
                preloadBackwards: 30,
                loadMoreBackwards: load,
            }),
        ).toBe(true)
        expect(load).toHaveBeenCalledWith(true)
    })

    it("preloads via math when content shorter than viewport (no DOM read)", () => {
        let load = vi.fn()
        expect(
            maybePreloadBackwards({
                itemCount: 35,
                preloadBackwards: 30,
                itemHeight: 72,
                viewportHeight: 4000,
                loadMoreBackwards: load,
            }),
        ).toBe(true)
        expect(load).toHaveBeenCalled()
        load.mockClear()
        expect(
            maybePreloadBackwards({
                itemCount: 40,
                preloadBackwards: 30,
                itemHeight: 72,
                viewportHeight: 400,
                loadMoreBackwards: load,
            }),
        ).toBe(false)
        expect(load).not.toHaveBeenCalled()
    })

    it("falls back to DOM metrics when math inputs missing", () => {
        let load = vi.fn()
        let el = document.createElement("div")
        Object.defineProperty(el, "scrollHeight", { value: 100 })
        Object.defineProperty(el, "clientHeight", { value: 400 })
        expect(
            maybePreloadBackwards({
                scrollContainer: el,
                itemCount: 40,
                preloadBackwards: 30,
                loadMoreBackwards: load,
            }),
        ).toBe(true)
        expect(load).toHaveBeenCalled()
    })
})
