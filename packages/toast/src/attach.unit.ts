// @vitest-environment jsdom
import { MENU_POPOVER_CLOSE_MS, MENU_POPOVER_OPEN_MS, MENU_POPOVER_SCALE } from "@yorozu/context-menu"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachToastRoot } from "./attach"
import { TOAST_ENTER_MS, TOAST_EXIT_MS, TOAST_SCALE, createToastSession, type ToastSession } from "./session"

describe("attachToastRoot", () => {
    let seq: number
    let session: ToastSession
    let root: HTMLElement
    let stop: (() => void) | undefined
    let animate: ReturnType<typeof vi.fn>

    beforeEach(() => {
        seq = 0
        vi.useFakeTimers()
        vi.setSystemTime(0)
        animate = vi.fn(() => ({
            finished: Promise.resolve(),
            cancel: vi.fn(),
        }))
        HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate
        session = createToastSession({ generateId: () => `id-${++seq}` })
        root = document.createElement("div")
        document.body.append(root)
        stop = attachToastRoot(session, root)
    })

    afterEach(() => {
        stop?.()
        stop = undefined
        session.destroy()
        root.remove()
        vi.useRealTimers()
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })

    it("marks the root and paints a string toast with close", () => {
        session.show("Hello")
        expect(root.getAttribute("data-yorozu-toast-root")).toBe("")
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        expect(item).toBeTruthy()
        expect(item.querySelector("[data-yorozu-toast-content]")!.textContent).toBe("Hello")
        let close = item.querySelector("[data-yorozu-toast-close]") as HTMLButtonElement
        expect(close.getAttribute("aria-label")).toBe("Close")
        expect(close.type).toBe("button")
        close.click()
        expect(item.classList.contains("exiting")).toBe(true)
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(root.querySelector("[data-yorozu-toast]")).toBeNull()
    })

    it("mounts function content and runs cleanup on remove", () => {
        let cleaned = 0
        session.show((el) => {
            el.textContent = "mounted"
            return () => {
                cleaned += 1
            }
        })
        expect(root.querySelector("[data-yorozu-toast-content]")!.textContent).toBe("mounted")
        session.dismiss("id-1")
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(cleaned).toBe(1)
        expect(root.querySelector("[data-yorozu-toast]")).toBeNull()
    })

    it("permanent toast has no close button and data-permanent", () => {
        session.show("stay", { permanent: true })
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        expect(item.hasAttribute("data-permanent")).toBe(true)
        expect(item.querySelector("[data-yorozu-toast-close]")).toBeNull()
        vi.advanceTimersByTime(10_000)
        expect(root.querySelector("[data-yorozu-toast]")).toBeTruthy()
        session.dismiss("id-1")
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(root.querySelector("[data-yorozu-toast]")).toBeNull()
    })

    it("does not rebuild an existing node on notify", () => {
        session.show("Hello")
        let first = root.querySelector("[data-yorozu-toast]")
        session.show("Other")
        expect(root.querySelector("[data-yorozu-toast]")).toBe(first)
        expect(root.querySelectorAll("[data-yorozu-toast]")).toHaveLength(2)
    })

    it("unsubscribe removes painted nodes and stops updates", () => {
        session.show("Hello")
        stop!()
        stop = undefined
        expect(root.querySelector("[data-yorozu-toast]")).toBeNull()
        session.show("Later")
        expect(root.querySelector("[data-yorozu-toast]")).toBeNull()
    })

    it("defaults data-placement to bottom-left and honors session placement", () => {
        session.show("Hello")
        expect(root.getAttribute("data-placement")).toBe("bottom-left")
        stop!()
        session.destroy()
        session = createToastSession({ generateId: () => `id-${++seq}`, placement: "top-center" })
        stop = attachToastRoot(session, root)
        session.show("Up")
        expect(root.getAttribute("data-placement")).toBe("top-center")
    })

    it("plays menu popover open on show and close on dismiss", () => {
        expect(TOAST_ENTER_MS).toBe(MENU_POPOVER_OPEN_MS)
        expect(TOAST_EXIT_MS).toBe(MENU_POPOVER_CLOSE_MS)
        expect(TOAST_SCALE).toBe(MENU_POPOVER_SCALE)
        session.show("Hello")
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        expect(animate).toHaveBeenCalled()
        expect(animate.mock.calls[0]![0]).toEqual([
            { transform: "scale(0.85)", opacity: "0" },
            { transform: "scale(1)", opacity: "1" },
        ])
        expect(item.style.getPropertyValue("transform-origin")).toBe("center bottom")
        animate.mockClear()
        session.dismiss("id-1")
        expect(item.classList.contains("exiting")).toBe(true)
        expect(animate.mock.calls[0]![0]).toEqual([
            { transform: "scale(1)", opacity: "1" },
            { transform: "scale(0.85)", opacity: "0" },
        ])
    })

    it("opens from center top when placement is top-*", () => {
        stop!()
        session.destroy()
        session = createToastSession({ generateId: () => `id-${++seq}`, placement: "top-left" })
        stop = attachToastRoot(session, root)
        session.show("Hi")
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        expect(item.style.getPropertyValue("transform-origin")).toBe("center top")
    })
})
