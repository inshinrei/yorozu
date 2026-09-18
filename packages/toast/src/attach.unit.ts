// @vitest-environment jsdom
import { MENU_POPOVER_CLOSE_MS, MENU_POPOVER_OPEN_MS, MENU_POPOVER_SCALE } from "@yorozu/context-menu"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachToastRoot } from "./attach"
import {
    TOAST_ENTER_MS,
    TOAST_EXIT_MS,
    TOAST_SCALE,
    TOAST_STACK_MAX_BEHIND,
    createToastSession,
    type ToastSession,
} from "./session"

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

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
            pause: vi.fn(),
            play: vi.fn(),
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

    it("permanent toast keeps a close button and data-permanent; click does not dismiss", () => {
        session.show("stay", { permanent: true })
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        expect(item.hasAttribute("data-permanent")).toBe(true)
        let close = item.querySelector("[data-yorozu-toast-close]") as HTMLButtonElement
        expect(close).toBeTruthy()
        close.click()
        expect(item.classList.contains("exiting")).toBe(false)
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

    it("permanent toasts live in the permanent lane before the stack", () => {
        session.show("stay", { permanent: true })
        session.show("temp")
        let lanes = [...root.children] as HTMLElement[]
        expect(lanes.map((el) => el.getAttribute("data-yorozu-toast-lane"))).toEqual(["permanent", "stack"])
        expect(root.querySelector('[data-yorozu-toast-lane="permanent"] [data-permanent]')).toBeTruthy()
        expect(
            root.querySelector('[data-yorozu-toast-lane="stack"] [data-yorozu-toast]:not([data-permanent])'),
        ).toBeTruthy()
    })

    it("stacks newest timed in front and up to 3 behind", async () => {
        for (let i = 0; i < 5; i++) session.show(`t-${i}`)
        let hiding = root.querySelector(`[data-stack-depth="${TOAST_STACK_MAX_BEHIND + 1}"]`) as HTMLElement | null
        expect(hiding?.querySelector("[data-yorozu-toast-content]")?.textContent).toBe("t-0")
        await flushMicrotasks()
        let stacked = [...root.querySelectorAll("[data-yorozu-toast-lane=stack] [data-yorozu-toast]")] as HTMLElement[]
        expect(stacked).toHaveLength(4)
        expect(stacked.map((el) => el.getAttribute("data-stack-depth"))).toEqual(["3", "2", "1", "0"])
        expect(stacked.at(-1)!.querySelector("[data-yorozu-toast-content]")!.textContent).toBe("t-4")
        expect(root.textContent).not.toContain("t-0")
    })

    it("a sixth timed toast keeps only active plus 3 behind", async () => {
        for (let i = 0; i < 6; i++) session.show(`t-${i}`)
        await flushMicrotasks()
        let stacked = [...root.querySelectorAll("[data-yorozu-toast-lane=stack] [data-yorozu-toast]")] as HTMLElement[]
        expect(stacked).toHaveLength(4)
        expect(stacked.map((el) => el.getAttribute("data-stack-depth"))).toEqual(["3", "2", "1", "0"])
        expect(stacked.at(-1)!.querySelector("[data-yorozu-toast-content]")!.textContent).toBe("t-5")
        expect(root.textContent).not.toContain("t-0")
        expect(root.textContent).not.toContain("t-1")
    })

    it("restacks and pops a waiting toast behind after the front is removed", async () => {
        for (let i = 0; i < 5; i++) session.show(`t-${i}`)
        await flushMicrotasks()
        session.dismiss("id-5")
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        let stacked = [...root.querySelectorAll("[data-yorozu-toast-lane=stack] [data-yorozu-toast]")] as HTMLElement[]
        expect(stacked).toHaveLength(4)
        expect(stacked.at(-1)!.querySelector("[data-yorozu-toast-content]")!.textContent).toBe("t-3")
        expect(stacked[0]!.querySelector("[data-yorozu-toast-content]")!.textContent).toBe("t-0")
        expect(stacked[0]!.getAttribute("data-stack-depth")).toBe("3")
    })

    it("animates depth changes on stacked toasts", () => {
        session.show("a")
        animate.mockClear()
        session.show("b")
        let depths = animate.mock.calls.map((c) => c[0])
        expect(depths.some((frames) => JSON.stringify(frames).includes("scale(0.95)"))).toBe(true)
    })

    it("duration 0 when prefersReducedMotion", () => {
        stop!()
        stop = attachToastRoot(session, root, { prefersReducedMotion: () => true })
        animate.mockClear()
        session.show("x")
        session.show("y")
        expect(animate).not.toHaveBeenCalled()
    })

    it("hides a timed toast that expires behind without snapping to the front slot", async () => {
        session.show("behind", { duration: 1000 })
        session.show("front", { duration: 5000 })
        await flushMicrotasks()
        let behind = [...root.querySelectorAll("[data-yorozu-toast]")].find(
            (el) => el.querySelector("[data-yorozu-toast-content]")?.textContent === "behind",
        ) as HTMLElement
        let front = [...root.querySelectorAll("[data-yorozu-toast]")].find(
            (el) => el.querySelector("[data-yorozu-toast-content]")?.textContent === "front",
        ) as HTMLElement
        expect(behind.getAttribute("data-stack-depth")).toBe("1")
        expect(front.getAttribute("data-stack-depth")).toBe("0")

        vi.advanceTimersByTime(1000)

        expect(front.getAttribute("data-stack-depth")).toBe("0")
        expect(behind.getAttribute("data-stack-depth")).not.toBe("0")
        expect(behind.getAttribute("data-stack-depth")).toBe(String(TOAST_STACK_MAX_BEHIND + 1))
        let transform = behind.style.getPropertyValue("transform")
        expect(transform).not.toBe("scale(1)")
        expect(transform.includes("translateY") || behind.style.getPropertyValue("opacity") === "0").toBe(true)
    })

    it("cancels playOpen when a stacked toast recedes behind a new front", async () => {
        let resolveOpen: (() => void) | undefined
        let openFinished = new Promise<void>((resolve) => {
            resolveOpen = resolve
        })
        let openCancel = vi.fn()
        let first = true
        animate.mockImplementation(() => {
            if (first) {
                first = false
                return { finished: openFinished, cancel: openCancel }
            }
            return { finished: Promise.resolve(), cancel: vi.fn() }
        })

        session.show("A")
        let receding = root.querySelector("[data-yorozu-toast]") as HTMLElement
        session.show("B")

        expect(openCancel).toHaveBeenCalled()
        await flushMicrotasks()
        resolveOpen!()
        await flushMicrotasks()

        expect(receding.getAttribute("data-stack-depth")).toBe("1")
        expect(receding.style.getPropertyValue("transform")).toBe("translateY(-8px) scale(0.95)")
        expect(receding.style.getPropertyValue("transform")).not.toBe("scale(1)")
        expect(receding.getAttribute("aria-hidden")).toBe("true")
        let close = receding.querySelector("[data-yorozu-toast-close]") as HTMLElement
        expect(close.getAttribute("tabindex")).toBe("-1")
        let front = [...root.querySelectorAll("[data-yorozu-toast]")].find(
            (el) => el.querySelector("[data-yorozu-toast-content]")?.textContent === "B",
        ) as HTMLElement
        expect(front.getAttribute("aria-hidden")).toBeNull()
        expect(front.querySelector("[data-yorozu-toast-close]")!.getAttribute("tabindex")).toBeNull()
    })

    it("paints an already-exiting behind toast so hide can run", () => {
        session.show("behind")
        session.show("front")
        session.dismiss("id-1")
        stop!()
        stop = attachToastRoot(session, root)
        let behind = [...root.querySelectorAll("[data-yorozu-toast]")].find(
            (el) => el.querySelector("[data-yorozu-toast-content]")?.textContent === "behind",
        ) as HTMLElement
        expect(behind).toBeTruthy()
        expect(behind.getAttribute("data-stack-depth")).toBe(String(TOAST_STACK_MAX_BEHIND + 1))
        expect(behind.classList.contains("exiting")).toBe(true)
    })

    it("applies width and height as inline px and keeps the same node on update", () => {
        session.show("Hello", { width: 320, height: 72 })
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        expect(item.style.width).toBe("320px")
        expect(item.style.height).toBe("72px")
        session.update("id-1", { width: 280, height: 80, content: "Next" })
        expect(root.querySelector("[data-yorozu-toast]")).toBe(item)
        expect(item.style.width).toBe("280px")
        expect(item.style.height).toBe("80px")
    })

    it("releasing a permanent toast drops data-permanent, moves the node into the stack, and close dismisses", () => {
        session.show("stay", { permanent: true })
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        animate.mockClear()
        session.update("id-1", { permanent: false, duration: 5000 })
        expect(item.hasAttribute("data-permanent")).toBe(false)
        expect(item.parentElement?.getAttribute("data-yorozu-toast-lane")).toBe("stack")
        expect(item.getAttribute("data-stack-depth")).toBe("0")
        let openFrames = animate.mock.calls.filter((c) => JSON.stringify(c[0]).includes("scale(0.85)"))
        expect(openFrames).toHaveLength(0)
        let hideBehind = animate.mock.calls.filter((c) => JSON.stringify(c[0]).includes("translateY(-32px)"))
        expect(hideBehind).toHaveLength(0)
        expect(item.style.getPropertyValue("transform")).toBe("translateY(0px) scale(1)")
        expect(item.style.getPropertyValue("opacity")).toBe("1")
        let close = item.querySelector("[data-yorozu-toast-close]") as HTMLButtonElement
        close.click()
        expect(item.classList.contains("exiting")).toBe(true)
    })

    it("fades and remounts content on update without rebuilding the shell", async () => {
        let cleaned = 0
        session.show((el) => {
            el.textContent = "one"
            return () => {
                cleaned += 1
            }
        })
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        let content = item.querySelector("[data-yorozu-toast-content]") as HTMLElement
        animate.mockClear()
        session.update("id-1", {
            content: (el) => {
                el.textContent = "two"
            },
        })
        await flushMicrotasks()
        expect(root.querySelector("[data-yorozu-toast]")).toBe(item)
        expect(content.textContent).toBe("two")
        expect(cleaned).toBe(1)
        let fadeFrames = animate.mock.calls.map((c) => c[0])
        expect(
            fadeFrames.some(
                (frames) => JSON.stringify(frames) === JSON.stringify([{ opacity: "1" }, { opacity: "0" }]),
            ),
        ).toBe(true)
        expect(
            fadeFrames.some(
                (frames) => JSON.stringify(frames) === JSON.stringify([{ opacity: "0" }, { opacity: "1" }]),
            ),
        ).toBe(true)
    })

    it("skips remount when content is the same reference", async () => {
        let mount = (el: HTMLElement): void => {
            el.textContent = "same"
        }
        session.show(mount)
        let content = root.querySelector("[data-yorozu-toast-content]") as HTMLElement
        animate.mockClear()
        session.update("id-1", { content: mount, progress: true })
        await flushMicrotasks()
        expect(content.textContent).toBe("same")
        let fadeFrames = animate.mock.calls.filter((c) => JSON.stringify(c[0]).includes("opacity"))
        expect(fadeFrames).toHaveLength(0)
    })

    it("content fade is instant when prefersReducedMotion", async () => {
        stop!()
        stop = attachToastRoot(session, root, { prefersReducedMotion: () => true })
        session.show("Hello")
        animate.mockClear()
        session.update("id-1", { content: "World" })
        await flushMicrotasks()
        expect(root.querySelector("[data-yorozu-toast-content]")!.textContent).toBe("World")
        expect(animate).not.toHaveBeenCalled()
    })

    it("does not restart an in-flight content fade when painted again with the same payload", async () => {
        let cleaned = 0
        let two = (el: HTMLElement): void => {
            el.textContent = "two"
        }
        session.show((el) => {
            el.textContent = "one"
            return () => {
                cleaned += 1
            }
        })
        let content = root.querySelector("[data-yorozu-toast-content]") as HTMLElement
        animate.mockClear()
        let resolveFade: (() => void) | undefined
        let fadeFinished = new Promise<void>((resolve) => {
            resolveFade = resolve
        })
        let fadeCancel = vi.fn()
        let fadeOuts = 0
        animate.mockImplementation((frames) => {
            if (JSON.stringify(frames) === JSON.stringify([{ opacity: "1" }, { opacity: "0" }])) {
                fadeOuts += 1
                return { finished: fadeFinished, cancel: fadeCancel }
            }
            return { finished: Promise.resolve(), cancel: vi.fn() }
        })
        session.update("id-1", { content: two })
        expect(fadeOuts).toBe(1)
        session.show("other")
        session.update("id-1", { content: two, progress: true })
        expect(fadeCancel).not.toHaveBeenCalled()
        expect(fadeOuts).toBe(1)
        expect(content.textContent).toBe("one")
        resolveFade!()
        await flushMicrotasks()
        expect(content.textContent).toBe("two")
        expect(cleaned).toBe(1)
        expect(content.isConnected).toBe(true)
    })

    it("does not remount content after the toast is dropped mid-fade", async () => {
        let mounts = 0
        let cleaned = 0
        session.show((el) => {
            el.textContent = "one"
            return () => {
                cleaned += 1
            }
        })
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        animate.mockClear()
        let fadeFinished = new Promise<void>(() => undefined)
        animate.mockImplementation((frames) => {
            if (JSON.stringify(frames) === JSON.stringify([{ opacity: "1" }, { opacity: "0" }])) {
                return { finished: fadeFinished, cancel: vi.fn() }
            }
            return { finished: Promise.resolve(), cancel: vi.fn() }
        })
        session.update("id-1", {
            content: (el) => {
                mounts += 1
                el.textContent = "two"
            },
        })
        expect(mounts).toBe(0)
        session.dismiss("id-1")
        vi.advanceTimersByTime(TOAST_EXIT_MS)
        expect(root.querySelector("[data-yorozu-toast]")).toBeNull()
        expect(item.isConnected).toBe(false)
        expect(cleaned).toBe(1)
        await flushMicrotasks()
        expect(mounts).toBe(0)
        expect(cleaned).toBe(1)
        expect(item.isConnected).toBe(false)
    })

    function scaleXCalls(): unknown[][] {
        return animate.mock.calls.filter((c) => JSON.stringify(c[0]).includes("scaleX"))
    }

    it("paints a remaining hairline and depletes scaleX over remaining ms", () => {
        session.show("Hello", { progress: true, duration: 1000 })
        let bar = root.querySelector("[data-yorozu-toast-progress]") as HTMLElement
        expect(bar).toBeTruthy()
        expect(bar.getAttribute("aria-hidden")).toBe("true")
        expect(scaleXCalls()[0]![0]).toEqual([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }])
        expect(scaleXCalls()[0]![1]).toMatchObject({ duration: 1000, easing: "linear", fill: "forwards" })
    })

    it("permanent progress is frozen full and starts depleting on release", () => {
        session.show("stay", { permanent: true, progress: true })
        expect(root.querySelector("[data-yorozu-toast-progress]")).toBeTruthy()
        expect(scaleXCalls()).toHaveLength(0)
        expect((root.querySelector("[data-yorozu-toast-progress]") as HTMLElement).style.transform).toBe("scaleX(1)")
        animate.mockClear()
        session.update("id-1", { permanent: false, duration: 4000 })
        expect(scaleXCalls()[0]![0]).toEqual([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }])
        expect(scaleXCalls()[0]![1]).toMatchObject({ duration: 4000, easing: "linear" })
    })

    it("progress false removes the hairline; enabling mid-life starts at the current ratio", () => {
        session.show("Hello", { duration: 1000 })
        expect(root.querySelector("[data-yorozu-toast-progress]")).toBeNull()
        vi.advanceTimersByTime(400)
        session.update("id-1", { progress: true })
        expect(scaleXCalls()[0]![0]).toEqual([{ transform: "scaleX(0.6)" }, { transform: "scaleX(0)" }])
        expect(scaleXCalls()[0]![1]).toMatchObject({ duration: 600, easing: "linear" })
        session.update("id-1", { progress: false })
        expect(root.querySelector("[data-yorozu-toast-progress]")).toBeNull()
    })

    it("hover pauses and resumes the hairline animation without recreating it", () => {
        session.show("Hello", { progress: true, duration: 1000 })
        let started = scaleXCalls().length
        let idx = animate.mock.calls.findIndex((c) => JSON.stringify(c[0]).includes("scaleX"))
        let anim = animate.mock.results[idx]!.value as {
            pause: ReturnType<typeof vi.fn>
            play: ReturnType<typeof vi.fn>
        }
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        item.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))
        expect(anim.pause).toHaveBeenCalled()
        item.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }))
        expect(anim.play).toHaveBeenCalled()
        expect(scaleXCalls().length).toBe(started)
    })

    it("another toast show does not retarget a running hairline", () => {
        session.show("Hello", { progress: true, duration: 5000 })
        let started = scaleXCalls().length
        session.show("Other")
        expect(scaleXCalls().length).toBe(started)
    })

    it("hairline still depletes when prefersReducedMotion", () => {
        stop!()
        stop = attachToastRoot(session, root, { prefersReducedMotion: () => true })
        animate.mockClear()
        session.show("Hello", { progress: true, duration: 1000 })
        expect(scaleXCalls()).toHaveLength(1)
        expect(scaleXCalls()[0]![1]).toMatchObject({ duration: 1000, easing: "linear" })
    })

    it("making a stacked toast permanent forgets stack chrome", async () => {
        session.show("behind")
        session.show("front")
        await flushMicrotasks()
        let behind = [...root.querySelectorAll("[data-yorozu-toast]")].find(
            (el) => el.querySelector("[data-yorozu-toast-content]")?.textContent === "behind",
        ) as HTMLElement
        expect(behind.getAttribute("data-stack-depth")).toBe("1")
        expect(behind.getAttribute("aria-hidden")).toBe("true")
        expect(behind.style.getPropertyValue("transform")).toBe("translateY(-8px) scale(0.95)")
        session.update("id-1", { permanent: true })
        expect(behind.parentElement?.getAttribute("data-yorozu-toast-lane")).toBe("permanent")
        expect(behind.hasAttribute("data-permanent")).toBe(true)
        expect(behind.hasAttribute("data-stack-depth")).toBe(false)
        expect(behind.getAttribute("aria-hidden")).toBeNull()
        expect(behind.style.getPropertyValue("transform")).toBe("")
        expect(behind.style.getPropertyValue("opacity")).toBe("")
        let close = behind.querySelector("[data-yorozu-toast-close]") as HTMLElement
        expect(close.getAttribute("tabindex")).toBe("-1")
        expect(close.getAttribute("aria-hidden")).toBe("true")
    })

    it("dismissed progress hairline does not refill to full", () => {
        session.show("Hello", { progress: true, duration: 1000 })
        vi.advanceTimersByTime(400)
        session.dismiss("id-1")
        let bar = root.querySelector("[data-yorozu-toast-progress]") as HTMLElement
        expect(bar).toBeTruthy()
        expect(bar.style.transform).not.toBe("scaleX(1)")
        expect(bar.style.transform).toBe("scaleX(0)")
    })

    it("update duration to the same value retargets the hairline", () => {
        session.show("Hello", { progress: true, duration: 5000 })
        expect(scaleXCalls()).toHaveLength(1)
        vi.advanceTimersByTime(1000)
        session.update("id-1", { duration: 5000 })
        expect(session.remaining("id-1")).toBe(5000)
        expect(scaleXCalls()).toHaveLength(2)
        expect(scaleXCalls()[1]![0]).toEqual([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }])
        expect(scaleXCalls()[1]![1]).toMatchObject({ duration: 5000, easing: "linear" })
    })

    it("permanent close is not in the tab order and is restored on release", () => {
        session.show("stay", { permanent: true })
        let item = root.querySelector("[data-yorozu-toast]") as HTMLElement
        let close = item.querySelector("[data-yorozu-toast-close]") as HTMLElement
        expect(close.getAttribute("tabindex")).toBe("-1")
        expect(close.getAttribute("aria-hidden")).toBe("true")
        session.update("id-1", { permanent: false, duration: 5000 })
        expect(close.getAttribute("tabindex")).toBeNull()
        expect(close.getAttribute("aria-hidden")).toBeNull()
    })

    it("hairline cancel swallows Animation.finished rejection", async () => {
        let catchCalls = 0
        animate.mockImplementation(() => {
            let rejectFinished: ((reason: unknown) => void) | undefined
            let inner = new Promise<void>((_, reject) => {
                rejectFinished = reject
            })
            let finished = {
                then: inner.then.bind(inner),
                catch: (onrejected?: (reason: unknown) => unknown) => {
                    catchCalls += 1
                    return inner.catch(onrejected)
                },
            }
            return {
                finished,
                cancel: () => {
                    rejectFinished?.(Object.assign(new Error("Aborted"), { name: "AbortError" }))
                },
                pause: vi.fn(),
                play: vi.fn(),
            }
        })
        session.show("Hello", { progress: true, duration: 1000 })
        expect(catchCalls).toBeGreaterThan(0)
        session.update("id-1", { progress: false })
        await flushMicrotasks()
        expect(root.querySelector("[data-yorozu-toast-progress]")).toBeNull()
    })
})
