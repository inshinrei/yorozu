// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachToastRoot } from "./attach"
import { TOAST_EXIT_MS, createToastSession, type ToastSession } from "./session"

describe("attachToastRoot", () => {
    let seq: number
    let session: ToastSession
    let root: HTMLElement
    let stop: (() => void) | undefined

    beforeEach(() => {
        seq = 0
        vi.useFakeTimers()
        vi.setSystemTime(0)
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
})
