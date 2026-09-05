// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
    CONFIRM_TOOLTIP_HISTORY_STATE,
    CONFIRM_TOOLTIP_PENDING_HISTORY_KEYS,
    bindHistoryWhenIdle,
    isPendingOverlayHistory,
} from "./history"

describe("isPendingOverlayHistory", () => {
    it("matches default overlay keys and custom keys", () => {
        expect(CONFIRM_TOOLTIP_PENDING_HISTORY_KEYS).toEqual(["yorozuMenu", "yorozuConfirm"])
        expect(isPendingOverlayHistory({ yorozuMenu: 1 })).toBe(true)
        expect(isPendingOverlayHistory({ yorozuConfirm: 1 })).toBe(true)
        expect(isPendingOverlayHistory({ hostMenu: 1 })).toBe(false)
        expect(isPendingOverlayHistory({ hostMenu: 1 }, ["hostMenu"])).toBe(true)
        expect(isPendingOverlayHistory(null)).toBe(false)
        expect(isPendingOverlayHistory(undefined)).toBe(false)
    })
})

describe("bindHistoryWhenIdle", () => {
    afterEach(() => {
        vi.restoreAllMocks()
        Reflect.deleteProperty(history, "state")
    })

    it("pushes immediately when history is idle", () => {
        let pushState = vi.spyOn(history, "pushState").mockImplementation(() => {})
        vi.spyOn(history, "go").mockImplementation(() => {})
        Object.defineProperty(history, "state", { configurable: true, get: () => null })
        let onBack = vi.fn()
        let layer = bindHistoryWhenIdle({ onBack, state: CONFIRM_TOOLTIP_HISTORY_STATE })
        expect(pushState).toHaveBeenCalledWith(CONFIRM_TOOLTIP_HISTORY_STATE, "")
        window.dispatchEvent(new PopStateEvent("popstate"))
        expect(onBack).toHaveBeenCalledTimes(1)
        layer.release()
    })

    it("defers push until a pending menu pop, and that pop is not onBack", () => {
        let pushState = vi.spyOn(history, "pushState").mockImplementation(() => {})
        vi.spyOn(history, "go").mockImplementation(() => {})
        Object.defineProperty(history, "state", {
            configurable: true,
            get: () => ({ yorozuMenu: 1 }),
        })
        let onBack = vi.fn()
        let layer = bindHistoryWhenIdle({ onBack, state: CONFIRM_TOOLTIP_HISTORY_STATE })
        expect(pushState).not.toHaveBeenCalled()
        window.dispatchEvent(new PopStateEvent("popstate"))
        expect(onBack).not.toHaveBeenCalled()
        expect(pushState).toHaveBeenCalledWith(CONFIRM_TOOLTIP_HISTORY_STATE, "")
        layer.release()
    })

    it("honors pendingKeys for a host menu marker", () => {
        let pushState = vi.spyOn(history, "pushState").mockImplementation(() => {})
        vi.spyOn(history, "go").mockImplementation(() => {})
        Object.defineProperty(history, "state", {
            configurable: true,
            get: () => ({ hostMenu: 1 }),
        })
        let layer = bindHistoryWhenIdle({
            onBack: () => {},
            state: { hostConfirm: 1 },
            pendingKeys: ["hostMenu"],
        })
        expect(pushState).not.toHaveBeenCalled()
        window.dispatchEvent(new PopStateEvent("popstate"))
        expect(pushState).toHaveBeenCalledWith({ hostConfirm: 1 }, "")
        layer.release()
    })

    it("release before the pending pop never pushes", () => {
        let pushState = vi.spyOn(history, "pushState").mockImplementation(() => {})
        Object.defineProperty(history, "state", {
            configurable: true,
            get: () => ({ yorozuMenu: 1 }),
        })
        let layer = bindHistoryWhenIdle({
            onBack: () => {},
            state: CONFIRM_TOOLTIP_HISTORY_STATE,
        })
        layer.release()
        window.dispatchEvent(new PopStateEvent("popstate"))
        expect(pushState).not.toHaveBeenCalled()
    })
})
