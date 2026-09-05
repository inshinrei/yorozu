// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    MENU_POINTER_NUDGE_PX,
    MENU_POPOVER_CLOSE_MS,
    MENU_POPOVER_OPEN_MS,
    MENU_POPOVER_SCALE,
    MENU_VIEW_MARGIN_PX,
} from "@yorozu/context-menu"
import { CONFIRM_TOOLTIP_HISTORY_STATE } from "./history"
import { CONFIRM_TOOLTIP_VIEW_MARGIN_PX } from "./place"
import {
    CONFIRM_TOOLTIP_CLOSE_MS,
    CONFIRM_TOOLTIP_INSIDE_SELECTOR,
    CONFIRM_TOOLTIP_OPEN_MS,
    CONFIRM_TOOLTIP_POINTER_NUDGE_PX,
    CONFIRM_TOOLTIP_SCALE,
    createConfirmTooltipSession,
    type ConfirmTooltipSession,
} from "./session"

function installSize(el: HTMLElement, box: { width: number; height: number }): void {
    Object.defineProperty(el, "offsetWidth", { configurable: true, get: () => box.width })
    Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => box.height })
}

async function flush(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

describe("createConfirmTooltipSession", () => {
    let el: HTMLElement
    let size: { width: number; height: number }
    let session: ConfirmTooltipSession | undefined
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
        el.setAttribute("data-yorozu-confirm", "")
        el.tabIndex = -1
        size = { width: 200, height: 80 }
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
        Reflect.deleteProperty(history, "state")
    })

    it("re-exports popover placement tokens from @yorozu/context-menu", () => {
        expect(CONFIRM_TOOLTIP_OPEN_MS).toBe(MENU_POPOVER_OPEN_MS)
        expect(CONFIRM_TOOLTIP_CLOSE_MS).toBe(MENU_POPOVER_CLOSE_MS)
        expect(CONFIRM_TOOLTIP_SCALE).toBe(MENU_POPOVER_SCALE)
        expect(CONFIRM_TOOLTIP_VIEW_MARGIN_PX).toBe(MENU_VIEW_MARGIN_PX)
        expect(CONFIRM_TOOLTIP_POINTER_NUDGE_PX).toBe(MENU_POINTER_NUDGE_PX)
        expect(CONFIRM_TOOLTIP_INSIDE_SELECTOR).toBe("[data-yorozu-confirm]")
        expect(CONFIRM_TOOLTIP_HISTORY_STATE).toEqual({ yorozuConfirm: 1 })
    })

    it("place sits below the pointer and centers horizontally", () => {
        let focus = vi.spyOn(el, "focus")
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        expect(el.style.left).toBe("300px")
        expect(el.style.top).toBe("100px")
        expect(el.style.getPropertyValue("transform-origin")).toBe("100px 0px")
        expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    })

    it("retries place on rAF when the first measure is 0", () => {
        vi.useFakeTimers()
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
            return setTimeout(() => cb(0), 0) as unknown as number
        })
        vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
            clearTimeout(id)
        })
        size.width = 0
        size.height = 0
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        expect(el.style.left).toBe("")
        expect(el.style.top).toBe("")
        size.width = 200
        size.height = 80
        vi.advanceTimersToNextTimer()
        expect(el.style.left).toBe("300px")
        expect(el.style.top).toBe("100px")
    })

    it("outside pointerdown closes after the close animation; inside the panel does not", async () => {
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        expect(onClose).not.toHaveBeenCalled()
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("canClose false ignores outside pointer and history-back, then allows close", async () => {
        let allow = false
        session = createConfirmTooltipSession({ onClose, canClose: () => allow })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        window.dispatchEvent(new PopStateEvent("popstate"))
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        allow = true
        window.dispatchEvent(new PopStateEvent("popstate"))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("does not close when a pending menu history pop fires after attach", () => {
        Object.defineProperty(history, "state", { configurable: true, get: () => ({ yorozuMenu: 1 }) })
        let pushSpy = history.pushState as unknown as ReturnType<typeof vi.fn>
        session = createConfirmTooltipSession({ onClose })
        pushSpy.mockClear()
        session.attach(el)
        expect(pushSpy).not.toHaveBeenCalled()
        window.dispatchEvent(new PopStateEvent("popstate"))
        expect(onClose).not.toHaveBeenCalled()
        expect(pushSpy).toHaveBeenCalled()
    })

    it("pendingHistoryKeys defers a host menu marker", () => {
        Object.defineProperty(history, "state", { configurable: true, get: () => ({ hostMenu: 1 }) })
        let pushSpy = history.pushState as unknown as ReturnType<typeof vi.fn>
        session = createConfirmTooltipSession({
            onClose,
            historyState: { hostConfirm: 1 },
            pendingHistoryKeys: ["hostMenu"],
        })
        pushSpy.mockClear()
        session.attach(el)
        expect(pushSpy).not.toHaveBeenCalled()
        window.dispatchEvent(new PopStateEvent("popstate"))
        expect(pushSpy).toHaveBeenCalledWith({ hostConfirm: 1 }, "")
    })

    it("getDurationMs 0 skips animate on open", () => {
        session = createConfirmTooltipSession({ onClose, getDurationMs: () => 0 })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        expect(animate).not.toHaveBeenCalled()
    })

    it("listenEsc true closes on Escape; default ignores", async () => {
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        session.destroy()
        session = createConfirmTooltipSession({ onClose, listenEsc: true })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("destroy does not call onClose", () => {
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        session.destroy()
        expect(onClose).not.toHaveBeenCalled()
    })

    it("place after close cancels close and opens again", async () => {
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        session.close()
        session.place({ x: 500, y: 120 })
        expect(el.style.left).toBe("400px")
        expect(el.style.top).toBe("120px")
        expect(onClose).not.toHaveBeenCalled()
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("duration-0 close then destroy same turn skips onClose", async () => {
        session = createConfirmTooltipSession({ onClose, getDurationMs: () => 0 })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        session.close()
        session.destroy()
        await flush()
        expect(onClose).not.toHaveBeenCalled()
    })

    it("non-pending attach pushState uses { yorozuConfirm: 1 } or historyState when passed", () => {
        Object.defineProperty(history, "state", { configurable: true, get: () => null })
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        expect(history.pushState).toHaveBeenCalledWith(CONFIRM_TOOLTIP_HISTORY_STATE, "")
        session.destroy()
        session = createConfirmTooltipSession({ onClose, historyState: { hostConfirm: 1 } })
        session.attach(el)
        expect(history.pushState).toHaveBeenCalledWith({ hostConfirm: 1 }, "")
    })

    it("canClose false ignores Escape when listenEsc is true", async () => {
        let allow = false
        session = createConfirmTooltipSession({
            onClose,
            listenEsc: true,
            canClose: () => allow,
        })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        await flush()
        expect(onClose).not.toHaveBeenCalled()
        allow = true
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("close adds closing class; resetClosing on place removes it", async () => {
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        expect(el.classList.contains("closing")).toBe(false)
        session.close()
        expect(el.classList.contains("closing")).toBe(true)
        session.place({ x: 500, y: 120 })
        expect(el.classList.contains("closing")).toBe(false)
        expect(onClose).not.toHaveBeenCalled()
    })

    it("destroy removes closing class and does not call onClose", () => {
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        session.close()
        expect(el.classList.contains("closing")).toBe(true)
        session.destroy()
        expect(el.classList.contains("closing")).toBe(false)
        expect(onClose).not.toHaveBeenCalled()
    })

    it("attach other node cancels in-flight close and does not call onClose", async () => {
        session = createConfirmTooltipSession({ onClose })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        session.close()
        let other = document.createElement("div")
        other.setAttribute("data-yorozu-confirm", "")
        other.tabIndex = -1
        installSize(other, size)
        document.body.append(other)
        try {
            session.attach(other)
            await flush()
            expect(onClose).not.toHaveBeenCalled()
            expect(el.classList.contains("closing")).toBe(false)
            session.place({ x: 400, y: 100 })
            expect(other.style.left).toBe("300px")
            expect(other.style.top).toBe("100px")
        } finally {
            other.remove()
        }
    })

    it("place after a completed close rebinds history", async () => {
        Object.defineProperty(history, "state", { configurable: true, get: () => null })
        let pushSpy = history.pushState as unknown as ReturnType<typeof vi.fn>
        session = createConfirmTooltipSession({ onClose, getDurationMs: () => 0 })
        session.attach(el)
        session.place({ x: 400, y: 100 })
        expect(pushSpy).toHaveBeenCalledTimes(1)
        session.close()
        await flush()
        expect(onClose).toHaveBeenCalledTimes(1)
        pushSpy.mockClear()
        session.place({ x: 500, y: 120 })
        expect(el.style.left).toBe("400px")
        expect(el.style.top).toBe("120px")
        expect(pushSpy).toHaveBeenCalledTimes(1)
    })
})
