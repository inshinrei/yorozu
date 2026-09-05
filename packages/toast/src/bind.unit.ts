// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { bindToastItem } from "./bind"
import { TOAST_EXIT_MS, createToastSession, type ToastSession } from "./session"

describe("bindToastItem", () => {
    let seq: number
    let session: ToastSession
    let el: HTMLElement
    let close: HTMLButtonElement
    let unbind: (() => void) | undefined

    beforeEach(() => {
        seq = 0
        vi.useFakeTimers()
        vi.setSystemTime(0)
        session = createToastSession({ generateId: () => `id-${++seq}` })
        el = document.createElement("div")
        close = document.createElement("button")
        close.setAttribute("data-yorozu-toast-close", "")
        el.append(close)
        document.body.append(el)
    })

    afterEach(() => {
        unbind?.()
        unbind = undefined
        session.destroy()
        el.remove()
        vi.useRealTimers()
    })

    it("pauses on pointerenter and resumes on pointerleave", () => {
        session.show("x", 1000)
        unbind = bindToastItem(el, session, "id-1")
        el.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))
        vi.advanceTimersByTime(5000)
        expect(session.toasts()[0]!.exiting).toBe(false)
        el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        vi.advanceTimersByTime(1000)
        expect(session.toasts()[0]!.exiting).toBe(true)
    })

    it("close click dismisses a timed toast", () => {
        session.show("x", 5000)
        unbind = bindToastItem(el, session, "id-1")
        close.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        expect(session.toasts()[0]!.exiting).toBe(true)
    })

    it("close click does not dismiss a permanent toast", () => {
        session.show("x", { permanent: true })
        unbind = bindToastItem(el, session, "id-1")
        close.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        expect(session.toasts()[0]!.exiting).toBe(false)
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(session.toasts()).toHaveLength(1)
    })

    it("unsubscribe stops hover and close", () => {
        session.show("x", 1000)
        unbind = bindToastItem(el, session, "id-1")
        unbind()
        unbind = undefined
        el.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))
        close.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        vi.advanceTimersByTime(1000)
        expect(session.toasts()[0]!.exiting).toBe(true)
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(session.toasts()).toHaveLength(0)
    })
})
