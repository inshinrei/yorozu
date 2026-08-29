import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MENU_SUBMENU_DELAY_MS, createSubmenuHover, createSubmenuOpenRegistry, type SubmenuAnchor } from "./submenu"

describe("createSubmenuHover", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("opens at rect.right - 16, rect.top", () => {
        let open: SubmenuAnchor | null = null
        let hover = createSubmenuHover({
            getRect: () => ({ right: 200, top: 40 }),
            isOpen: () => open != null,
            setOpen: (next) => {
                open = next
            },
        })
        hover.open()
        expect(open).toEqual({ x: 200 - 16, y: 40 })
    })

    it("scheduleOpen + leave before delay never opens", () => {
        let open: SubmenuAnchor | null = null
        let hover = createSubmenuHover({
            getRect: () => ({ right: 100, top: 10 }),
            isOpen: () => open != null,
            setOpen: (next) => {
                open = next
            },
        })
        hover.scheduleOpen()
        vi.advanceTimersByTime(MENU_SUBMENU_DELAY_MS - 1)
        hover.scheduleClose()
        vi.advanceTimersByTime(MENU_SUBMENU_DELAY_MS)
        expect(open).toBeNull()
    })

    it("open is a no-op when getRect is undefined", () => {
        let setOpen = vi.fn()
        let hover = createSubmenuHover({
            getRect: () => undefined,
            isOpen: () => false,
            setOpen,
        })
        hover.open()
        expect(setOpen).not.toHaveBeenCalled()
    })

    it("openFromClick ignores scheduleClose until cancelClose", () => {
        let open: SubmenuAnchor | null = null
        let hover = createSubmenuHover({
            getRect: () => ({ right: 80, top: 20 }),
            isOpen: () => open != null,
            setOpen: (next) => {
                open = next
            },
        })
        hover.openFromClick()
        expect(open).toEqual({ x: 64, y: 20 })
        hover.scheduleClose()
        vi.advanceTimersByTime(MENU_SUBMENU_DELAY_MS)
        expect(open).toEqual({ x: 64, y: 20 })
        hover.cancelClose()
        hover.scheduleClose()
        vi.advanceTimersByTime(MENU_SUBMENU_DELAY_MS)
        expect(open).toBeNull()
    })
})

describe("createSubmenuOpenRegistry", () => {
    it("registerOpen closes the previous; repeat of current is a no-op", () => {
        let registry = createSubmenuOpenRegistry()
        let closeA = vi.fn()
        let closeB = vi.fn()
        registry.registerOpen(closeA)
        expect(closeA).not.toHaveBeenCalled()
        registry.registerOpen(closeB)
        expect(closeA).toHaveBeenCalledTimes(1)
        registry.registerOpen(closeB)
        expect(closeB).not.toHaveBeenCalled()
        expect(closeA).toHaveBeenCalledTimes(1)
    })

    it("unregister of a stale closer does not clear current", () => {
        let registry = createSubmenuOpenRegistry()
        let closeA = vi.fn()
        let closeB = vi.fn()
        registry.registerOpen(closeA)
        registry.unregister(closeB)
        registry.registerOpen(closeB)
        expect(closeA).toHaveBeenCalledTimes(1)
    })
})
