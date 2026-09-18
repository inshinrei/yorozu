import { STACK_LAYER_MAX_BEHIND } from "@yorozu/animations"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    TOAST_DURATION_MS,
    TOAST_ENTER_MS,
    TOAST_EXIT_MS,
    TOAST_PLACEMENT_DEFAULT,
    TOAST_RESUME_MIN_MS,
    TOAST_SCALE,
    TOAST_STACK_MAX_BEHIND,
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

    it("exports duration tokens matching menu popover motion", () => {
        expect(TOAST_DURATION_MS).toBe(5000)
        expect(TOAST_RESUME_MIN_MS).toBe(50)
        expect(TOAST_ENTER_MS).toBe(150)
        expect(TOAST_EXIT_MS).toBe(200)
        expect(TOAST_SCALE).toBe(0.85)
        expect(TOAST_PLACEMENT_DEFAULT).toBe("bottom-left")
        expect(TOAST_STACK_MAX_BEHIND).toBe(STACK_LAYER_MAX_BEHIND)
    })

    it("default generateId returns a non-empty id", () => {
        let s = createToastSession()
        let id = s.show("x")
        expect(id.length).toBeGreaterThan(0)
        expect(s.toasts()[0]!.id).toBe(id)
        s.destroy()
    })

    it("placement defaults to bottom-left and can be set at create", () => {
        expect(session!.placement()).toBe("bottom-left")
        let s = createToastSession({ generateId: () => "p", placement: "top-right" })
        expect(s.placement()).toBe("top-right")
        s.destroy()
    })

    it("pause from a show subscriber still catches the timer", () => {
        session!.subscribe(() => {
            let id = session!.toasts()[0]?.id
            if (id) session!.pause(id)
        })
        session!.show("x", 1000)
        vi.advanceTimersByTime(5000)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        session!.resume("id-1")
        vi.advanceTimersByTime(1000)
        expect(session!.toasts()[0]!.exiting).toBe(true)
    })

    it("adds a toast with default duration and returns the id", () => {
        let id = session!.show("Hello")
        expect(id).toBe("id-1")
        expect(session!.toasts()).toEqual([
            { id: "id-1", content: "Hello", duration: 5000, permanent: false, exiting: false, progress: false },
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
        vi.advanceTimersByTime(400)
        session!.pause("id-1")
        session!.pause("id-1")
        session!.resume("id-1")
        session!.resume("id-1")
        vi.advanceTimersByTime(599)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        vi.advanceTimersByTime(1)
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

    it("show stores optional width, height, and progress", () => {
        session!.show("a", { width: 320, height: 72, progress: true })
        expect(session!.toasts()[0]).toMatchObject({
            width: 320,
            height: 72,
            progress: true,
            permanent: false,
            duration: 5000,
        })
        session!.show("b", { width: 0, height: -4, progress: false })
        expect(session!.toasts()[1]!.width).toBeUndefined()
        expect(session!.toasts()[1]!.height).toBeUndefined()
        expect(session!.toasts()[1]!.progress).toBe(false)
    })

    it("remaining is live while running, frozen while paused, 0 for permanent/unknown", () => {
        session!.show("x", 1000)
        vi.advanceTimersByTime(400)
        expect(session!.remaining("id-1")).toBe(600)
        session!.pause("id-1")
        vi.advanceTimersByTime(5000)
        expect(session!.remaining("id-1")).toBe(600)
        expect(session!.remaining("missing")).toBe(0)
        session!.show("stay", { permanent: true })
        expect(session!.remaining("id-2")).toBe(0)
        session!.resume("id-1")
        vi.advanceTimersByTime(200)
        expect(session!.remaining("id-1")).toBe(400)
    })

    it("update no-ops for unknown, exiting, destroyed, empty, and same-ref content", () => {
        let id = session!.show("Hello")
        let n = 0
        session!.subscribe(() => {
            n += 1
        })
        session!.update("missing", { content: "x" })
        session!.update(id, {})
        session!.update(id, { content: "Hello" })
        expect(n).toBe(0)
        session!.dismiss(id)
        n = 0
        session!.update(id, { content: "gone" })
        expect(n).toBe(0)
        expect(session!.toasts()[0]!.content).toBe("Hello")
        session!.destroy()
        session!.update(id, { content: "z" })
        expect(session!.remaining(id)).toBe(0)
    })

    it("update replaces content and notifies once", () => {
        let id = session!.show("Hello")
        let n = 0
        session!.subscribe(() => {
            n += 1
        })
        session!.update(id, { content: "World" })
        expect(session!.toasts()[0]!.content).toBe("World")
        expect(n).toBe(1)
    })

    it("update writes size and progress; ignores non-positive size", () => {
        let id = session!.show("x")
        session!.update(id, { width: 280, height: 64, progress: true })
        expect(session!.toasts()[0]).toMatchObject({ width: 280, height: 64, progress: true })
        session!.update(id, { width: 0, height: -1, progress: false })
        expect(session!.toasts()[0]!.width).toBe(280)
        expect(session!.toasts()[0]!.height).toBe(64)
        expect(session!.toasts()[0]!.progress).toBe(false)
    })

    it("update duration on a timed toast resets remaining and restarts the timer", () => {
        let id = session!.show("x", 1000)
        vi.advanceTimersByTime(400)
        session!.update(id, { duration: 800 })
        expect(session!.toasts()[0]!.duration).toBe(800)
        expect(session!.remaining(id)).toBe(800)
        vi.advanceTimersByTime(799)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        vi.advanceTimersByTime(1)
        expect(session!.toasts()[0]!.exiting).toBe(true)
    })

    it("update duration is ignored while permanent", () => {
        let id = session!.show("stay", { permanent: true })
        session!.update(id, { duration: 4000 })
        expect(session!.toasts()[0]!.duration).toBe(0)
        expect(session!.remaining(id)).toBe(0)
        vi.advanceTimersByTime(4000)
        expect(session!.toasts()[0]!.exiting).toBe(false)
    })

    it("update permanent false arms a timer with patch duration or session default and moves the slot last", () => {
        session!.show("a")
        let pid = session!.show("p", { permanent: true })
        session!.show("b")
        session!.update(pid, { permanent: false, duration: 4000 })
        expect(session!.toasts().map((t) => t.id)).toEqual(["id-1", "id-3", "id-2"])
        expect(session!.toasts()[2]).toMatchObject({
            id: pid,
            permanent: false,
            duration: 4000,
            progress: false,
        })
        expect(session!.remaining(pid)).toBe(4000)
        vi.advanceTimersByTime(4000)
        expect(session!.toasts()[2]!.exiting).toBe(true)
    })

    it("update permanent false without duration uses the session default", () => {
        let s = createToastSession({ generateId: () => "p", duration: 250 })
        s.show("stay", { permanent: true })
        s.update("p", { permanent: false })
        expect(s.toasts()[0]!.duration).toBe(250)
        expect(s.remaining("p")).toBe(250)
        vi.advanceTimersByTime(250)
        expect(s.toasts()[0]!.exiting).toBe(true)
        s.destroy()
    })

    it("update permanent true clears the timer", () => {
        let id = session!.show("x", 1000)
        vi.advanceTimersByTime(400)
        session!.update(id, { permanent: true })
        expect(session!.toasts()[0]).toMatchObject({ permanent: true, duration: 0 })
        expect(session!.remaining(id)).toBe(0)
        session!.pause(id)
        session!.resume(id)
        vi.advanceTimersByTime(10_000)
        expect(session!.toasts()[0]!.exiting).toBe(false)
    })

    it("remaining is 0 while exiting", () => {
        let id = session!.show("x", 1000)
        vi.advanceTimersByTime(400)
        expect(session!.remaining(id)).toBe(600)
        session!.dismiss(id)
        expect(session!.toasts()[0]!.exiting).toBe(true)
        expect(session!.remaining(id)).toBe(0)
    })

    it("update duration while paused does not arm until resume", () => {
        let id = session!.show("x", 1000)
        vi.advanceTimersByTime(400)
        session!.pause(id)
        session!.update(id, { duration: 800 })
        expect(session!.toasts()[0]!.duration).toBe(800)
        expect(session!.remaining(id)).toBe(800)
        vi.advanceTimersByTime(800)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        session!.resume(id)
        vi.advanceTimersByTime(799)
        expect(session!.toasts()[0]!.exiting).toBe(false)
        vi.advanceTimersByTime(1)
        expect(session!.toasts()[0]!.exiting).toBe(true)
    })
})
