// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MENU_HISTORY_STATE } from "./history"
import { MENU_MAX_HEIGHT_BOTTOM_MARGIN_PX } from "./place-fixed"
import { createMenuSession, type MenuSession } from "./session"

function installSize(el: HTMLElement, box: { width: number; height: number }): void {
    Object.defineProperty(el, "offsetWidth", { configurable: true, get: () => box.width })
    Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => box.height })
}

async function flush(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

describe("createMenuSession", () => {
    let el: HTMLElement
    let size: { width: number; height: number }
    let session: MenuSession | undefined
    let animate = vi.fn(() => ({
        finished: Promise.resolve(),
        cancel: vi.fn(),
    }))
    let onClose = vi.fn()

    beforeEach(() => {
        onClose = vi.fn()
        animate = vi.fn(() => ({
            finished: Promise.resolve(),
            cancel: vi.fn(),
        }))
        HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate

        Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 2000 })
        Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 2000 })

        vi.spyOn(history, "pushState").mockImplementation(() => {})
        vi.spyOn(history, "go").mockImplementation(() => {})

        el = document.createElement("div")
        el.setAttribute("data-yorozu-menu", "")
        el.tabIndex = -1
        size = { width: 160, height: 100 }
        installSize(el, size)
        document.body.append(el)
    })

    afterEach(() => {
        session?.destroy()
        session = undefined
        el.remove()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })

    it("placePointer writes left/top and focuses without scroll", () => {
        let focus = vi.spyOn(el, "focus")
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        expect(el.style.left).toBe("123px")
        expect(el.style.top).toBe("80px")
        expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    })

    it("retries placePointer on rAF when the first measure is 0", () => {
        vi.useFakeTimers()
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
            return setTimeout(() => cb(0), 0) as unknown as number
        })
        vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
            clearTimeout(id)
        })

        size.width = 0
        size.height = 0
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        expect(el.style.left).toBe("")
        expect(el.style.top).toBe("")

        size.width = 160
        size.height = 100
        vi.advanceTimersToNextTimer()
        expect(el.style.left).toBe("123px")
        expect(el.style.top).toBe("80px")
    })

    it("outside pointerdown closes after the close animation; inside the menu does not", async () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })

        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).not.toHaveBeenCalled()

        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        expect(onClose).not.toHaveBeenCalled()
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("nested sessions do not push history", () => {
        session = createMenuSession({ onClose, nested: true })
        session.attach(el)
        expect(history.pushState).not.toHaveBeenCalled()
    })

    it("non-nested pushState uses { yorozuMenu: 1 } or historyState when passed", () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        expect(history.pushState).toHaveBeenCalledWith(MENU_HISTORY_STATE, "")
        expect(MENU_HISTORY_STATE).toEqual({ yorozuMenu: 1 })
        session.destroy()

        session = createMenuSession({ onClose, historyState: { hostMenu: 1 } })
        session.attach(el)
        expect(history.pushState).toHaveBeenCalledWith({ hostMenu: 1 }, "")
    })

    it("getDurationMs 0 skips animate on open", () => {
        session = createMenuSession({ onClose, getDurationMs: () => 0 })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        expect(animate).not.toHaveBeenCalled()
    })

    it("listenEsc false ignores Escape; default listens", async () => {
        session = createMenuSession({ onClose, listenEsc: false })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        animate.mockClear()
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        expect(animate).not.toHaveBeenCalled()
        session.destroy()

        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        animate.mockClear()
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        expect(onClose).not.toHaveBeenCalled()
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("applyMaxHeightStyle false still sets the CSS variable, not style.maxHeight", () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 }, { withMaxHeight: true, applyMaxHeightStyle: false })
        expect(el.style.getPropertyValue("--yorozu-menu-max-height")).toBe(
            `${2000 - MENU_MAX_HEIGHT_BOTTOM_MARGIN_PX}px`,
        )
        expect(el.style.maxHeight).toBe("")
        expect(el.style.overflow).toBe("")
    })

    it("placeAbove writes bottom/left and unsets top", () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        session.placeAbove({ bottom: 108, left: 40, right: undefined, origin: "bottom left" })
        expect(el.style.bottom).toBe("108px")
        expect(el.style.left).toBe("40px")
        expect(el.style.right).toBe("unset")
        expect(el.style.top).toBe("unset")
    })

    it("destroy does not call onClose", () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        session.destroy()
        expect(onClose).not.toHaveBeenCalled()
    })

    it("placePointer after close cancels close and opens again", async () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        session.close()
        session.placePointer({ x: 200, y: 90 })
        expect(el.style.left).toBe("203px")
        expect(el.style.top).toBe("90px")
        expect(onClose).not.toHaveBeenCalled()
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("close then placeAbove same turn skips onClose", async () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        session.close()
        session.placeAbove({ bottom: 108, left: 40, right: undefined, origin: "bottom left" })
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        expect(el.style.bottom).toBe("108px")
        expect(el.style.left).toBe("40px")
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("duration-0 close then placeAbove same turn skips onClose", async () => {
        session = createMenuSession({ onClose, getDurationMs: () => 0 })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        session.close()
        session.placeAbove({ bottom: 108, left: 40, right: undefined, origin: "bottom left" })
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        expect(el.style.bottom).toBe("108px")
        expect(el.style.left).toBe("40px")
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("placePointer without withMaxHeight clears leftover max-height", () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 }, { withMaxHeight: true })
        let maxHeight = `${2000 - MENU_MAX_HEIGHT_BOTTOM_MARGIN_PX}px`
        expect(el.style.getPropertyValue("--yorozu-menu-max-height")).toBe(maxHeight)
        expect(el.style.maxHeight).toBe(maxHeight)
        expect(el.style.overflow).toBe("auto")
        session.placePointer({ x: 200, y: 90 })
        expect(el.style.getPropertyValue("--yorozu-menu-max-height")).toBe("")
        expect(el.style.maxHeight).toBe("")
        expect(el.style.overflow).toBe("")
    })

    it("placeAbove clears leftover max-height", () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 }, { withMaxHeight: true })
        session.placeAbove({ bottom: 108, left: 40, right: undefined, origin: "bottom left" })
        expect(el.style.getPropertyValue("--yorozu-menu-max-height")).toBe("")
        expect(el.style.maxHeight).toBe("")
        expect(el.style.overflow).toBe("")
    })

    it("attach same node is idempotent; other node rebinds history", () => {
        session = createMenuSession({ onClose })
        session.attach(el)
        expect(history.pushState).toHaveBeenCalledTimes(1)
        session.attach(el)
        expect(history.pushState).toHaveBeenCalledTimes(1)
        expect(history.go).not.toHaveBeenCalled()

        Object.defineProperty(history, "state", {
            configurable: true,
            get: () => MENU_HISTORY_STATE,
        })
        let other = document.createElement("div")
        other.setAttribute("data-yorozu-menu", "")
        other.tabIndex = -1
        installSize(other, size)
        document.body.append(other)
        try {
            session.attach(other)
            expect(history.go).toHaveBeenCalledWith(-1)
            expect(history.pushState).toHaveBeenCalledTimes(2)
        } finally {
            other.remove()
            Reflect.deleteProperty(history, "state")
        }
    })

    it("duration-0 close then placePointer same turn skips onClose", async () => {
        session = createMenuSession({ onClose, getDurationMs: () => 0 })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        session.close()
        session.placePointer({ x: 200, y: 90 })
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        expect(history.go).not.toHaveBeenCalled()
        expect(el.style.left).toBe("203px")
        expect(el.style.top).toBe("90px")
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("duration-0 close then destroy same turn skips onClose", async () => {
        session = createMenuSession({ onClose, getDurationMs: () => 0 })
        session.attach(el)
        session.placePointer({ x: 120, y: 80 })
        session.close()
        session.destroy()
        await flush()
        expect(onClose).not.toHaveBeenCalled()
    })
})
