// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { MENU_HISTORY_STATE, bindHistoryLayer, isMenuHistoryState } from "./history"

describe("bindHistoryLayer", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("pushes { yorozuMenu: 1 } on bind", () => {
        let pushState = vi.spyOn(history, "pushState")
        let go = vi.spyOn(history, "go").mockImplementation(() => {})
        let layer = bindHistoryLayer({ onBack: () => {} })
        expect(pushState).toHaveBeenCalledWith(MENU_HISTORY_STATE, "")
        expect(MENU_HISTORY_STATE).toEqual({ yorozuMenu: 1 })
        // Pretend we are still on the menu marker so release takes the go(-1) path.
        Object.defineProperty(history, "state", {
            configurable: true,
            get: () => MENU_HISTORY_STATE,
        })
        layer.release()
        expect(go).toHaveBeenCalledWith(-1)
        Reflect.deleteProperty(history, "state")
    })

    it("popstate calls onBack once", () => {
        vi.spyOn(history, "pushState").mockImplementation(() => {})
        let onBack = vi.fn()
        bindHistoryLayer({ onBack })
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
        expect(onBack).toHaveBeenCalledTimes(1)
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }))
        expect(onBack).toHaveBeenCalledTimes(1)
    })

    it("release goes -1 once and ignores that popstate", () => {
        vi.spyOn(history, "pushState").mockImplementation(() => {})
        let onBack = vi.fn()
        let go = vi.spyOn(history, "go").mockImplementation(() => {})
        Object.defineProperty(history, "state", {
            configurable: true,
            get: () => MENU_HISTORY_STATE,
        })
        let layer = bindHistoryLayer({ onBack })
        layer.release()
        expect(go).toHaveBeenCalledWith(-1)
        expect(go).toHaveBeenCalledTimes(1)
        window.dispatchEvent(new PopStateEvent("popstate", { state: MENU_HISTORY_STATE }))
        expect(onBack).not.toHaveBeenCalled()
        Reflect.deleteProperty(history, "state")
    })

    it("pushes a custom host marker when state is passed", () => {
        let pushState = vi.spyOn(history, "pushState")
        vi.spyOn(history, "go").mockImplementation(() => {})
        Object.defineProperty(history, "state", {
            configurable: true,
            get: () => ({ hostMenu: 1 }),
        })
        let layer = bindHistoryLayer({
            onBack: () => {},
            state: { hostMenu: 1 },
        })
        expect(pushState).toHaveBeenCalledWith({ hostMenu: 1 }, "")
        layer.release()
        Reflect.deleteProperty(history, "state")
    })
})

describe("isMenuHistoryState", () => {
    it("matches the default and custom markers", () => {
        expect(isMenuHistoryState({ yorozuMenu: 1 })).toBe(true)
        expect(isMenuHistoryState({ hostMenu: 1 }, { hostMenu: 1 })).toBe(true)
        expect(isMenuHistoryState({ yorozuMenu: 1 }, { hostMenu: 1 })).toBe(false)
        expect(isMenuHistoryState(null)).toBe(false)
    })
})
