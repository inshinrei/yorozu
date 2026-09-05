import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    TOAST_DURATION_MS,
    TOAST_ENTER_MS,
    TOAST_EXIT_MS,
    TOAST_RESUME_MIN_MS,
    createToastSession,
    type ToastSession,
} from "./session"

describe("createToastSession", () => {
    let seq: number
    let session: ToastSession | undefined

    beforeEach(() => {
        seq = 0
        vi.useFakeTimers()
        vi.setSystemTime(0)
        session = createToastSession({ generateId: () => `id-${++seq}` })
    })

    afterEach(() => {
        session?.destroy()
        session = undefined
        vi.useRealTimers()
    })

    it("exports duration tokens", () => {
        expect(TOAST_DURATION_MS).toBe(5000)
        expect(TOAST_EXIT_MS).toBe(300)
        expect(TOAST_RESUME_MIN_MS).toBe(50)
        expect(TOAST_ENTER_MS).toBe(400)
    })

    it("adds a toast with default duration and returns the id", () => {
        let id = session!.show("Hello")
        expect(id).toBe("id-1")
        expect(session!.toasts()).toEqual([
            { id: "id-1", content: "Hello", duration: 5000, permanent: false, exiting: false },
        ])
        expect(session!.toasts()).not.toBe(session!.toasts())
        expect(session!.toasts()[0]).toBe(session!.toasts()[0])
    })

    it("supports duration number and opts object", () => {
        session!.show("a", 3000)
        session!.show("b", { duration: 1000 })
        expect(session!.toasts()[0]!.duration).toBe(3000)
        expect(session!.toasts()[1]!.duration).toBe(1000)
    })

    it("stores custom content by reference", () => {
        let mount = (el: HTMLElement): void => {
            el.textContent = "x"
        }
        session!.show(mount)
        expect(session!.toasts()[0]!.content).toBe(mount)
    })

    it("notifies subscribers on show and unsubscribes", () => {
        let n = 0
        let stop = session!.subscribe(() => {
            n += 1
        })
        session!.show("a")
        session!.show("b")
        expect(n).toBe(2)
        stop()
        session!.show("c")
        expect(n).toBe(2)
    })

    it("dismiss marks exiting then removes after exitMs", () => {
        let id = session!.show("x")
        let n = 0
        session!.subscribe(() => {
            n += 1
        })
        session!.dismiss(id)
        expect(session!.toasts()[0]!.exiting).toBe(true)
        expect(n).toBe(1)
        vi.advanceTimersByTime(TOAST_EXIT_MS - 1)
        expect(session!.toasts()).toHaveLength(1)
        vi.advanceTimersByTime(1)
        expect(session!.toasts()).toHaveLength(0)
        expect(n).toBe(2)
    })

    it("dismiss of unknown or already-exiting id is a no-op", () => {
        let id = session!.show("x")
        session!.dismiss("missing")
        expect(session!.toasts()).toHaveLength(1)
        session!.dismiss(id)
        session!.dismiss(id)
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(session!.toasts()).toHaveLength(0)
    })

    it("exitMs 0 splices in the same turn", () => {
        let s = createToastSession({ generateId: () => "z", exitMs: 0 })
        s.show("x")
        s.dismiss("z")
        expect(s.toasts()).toHaveLength(0)
        s.destroy()
    })

    it("auto-dismisses after duration then exit", () => {
        session!.show("x", 1000)
        vi.advanceTimersByTime(999)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        vi.advanceTimersByTime(1)
        expect(session!.toasts()[0]!.exiting).toBe(true)
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(session!.toasts()).toHaveLength(0)
    })

    it("pause subtracts elapsed remaining and resume continues it", () => {
        session!.show("x", 1000)
        vi.advanceTimersByTime(400)
        session!.pause("id-1")
        vi.advanceTimersByTime(5000)
        expect(session!.toasts()).toHaveLength(1)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        session!.resume("id-1")
        vi.advanceTimersByTime(599)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        vi.advanceTimersByTime(1)
        expect(session!.toasts()[0]!.exiting).toBe(true)
    })

    it("resume with remaining <= 50 dismisses", () => {
        session!.show("x", 100)
        vi.advanceTimersByTime(60)
        session!.pause("id-1")
        session!.resume("id-1")
        expect(session!.toasts()[0]!.exiting).toBe(true)
    })

    it("pause of already-paused and resume of running are no-ops", () => {
        session!.show("x", 1000)
        session!.pause("id-1")
        session!.pause("id-1")
        session!.resume("id-1")
        session!.resume("id-1")
        vi.advanceTimersByTime(1000)
        expect(session!.toasts()[0]!.exiting).toBe(true)
    })

    it("permanent toast has no timer and ignores pause/resume; dismiss still works", () => {
        let id = session!.show("stay", { permanent: true, duration: 10 })
        expect(session!.toasts()[0]).toMatchObject({
            id,
            duration: 0,
            permanent: true,
            exiting: false,
        })
        vi.advanceTimersByTime(10_000)
        expect(session!.toasts()).toHaveLength(1)
        session!.pause(id)
        session!.resume(id)
        vi.advanceTimersByTime(10_000)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        session!.dismiss(id)
        expect(session!.toasts()[0]!.exiting).toBe(true)
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(session!.toasts()).toHaveLength(0)
    })

    it("destroy empties immediately, notifies, and deadens the session", () => {
        let n = 0
        session!.subscribe(() => {
            n += 1
        })
        session!.show("a")
        session!.show("b", { permanent: true })
        n = 0
        session!.destroy()
        expect(session!.toasts()).toHaveLength(0)
        expect(n).toBe(1)
        expect(session!.show("c")).toBe("")
        session!.dismiss("id-1")
        session!.destroy()
        expect(session!.toasts()).toHaveLength(0)
        expect(n).toBe(1)
    })

    it("uses session default duration option", () => {
        let s = createToastSession({ generateId: () => "d", duration: 250 })
        s.show("x")
        expect(s.toasts()[0]!.duration).toBe(250)
        vi.advanceTimersByTime(250)
        expect(s.toasts()[0]!.exiting).toBe(true)
        s.destroy()
    })
})
