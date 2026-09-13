// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { createMediaShell, MEDIA_CHROME_MS, MEDIA_CLOSE_MS, MEDIA_OPEN_MS, MEDIA_SWITCH_MS } from "./shell"

describe("createMediaShell", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it("starts ready when there is no origin", () => {
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => false,
            onFinishClose: () => {},
        })
        expect(shell.phase()).toEqual({ kind: "ready" })
        expect(shell.openPhase()).toBe("open")
        expect(shell.scrimSolid()).toBe(true)
        expect(shell.mediaRevealed()).toBe(true)
        expect(shell.pinnedPreviewUrl()).toBeNull()
        shell.destroy()
    })

    it("with origin startOpen stays open-flight until onLand", async () => {
        let land: (() => void | Promise<void>) | undefined
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => true,
            getOpenPinnedUrl: () => "pin.jpg",
            runOpenGhost: ({ onLand }) => {
                land = onLand
                return true
            },
            onFinishClose: () => {},
        })
        expect(shell.phase()).toEqual({ kind: "open-flight", pinnedUrl: "pin.jpg", scrimSolid: false })
        expect(shell.openPhase()).toBe("opening")
        expect(shell.mediaRevealed()).toBe(false)
        expect(shell.pinnedPreviewUrl()).toBe("pin.jpg")

        let started = shell.startOpen()
        expect(shell.phase()).toEqual({ kind: "open-flight", pinnedUrl: "pin.jpg", scrimSolid: false })
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
        expect(land).toBeTypeOf("function")
        expect(shell.phase()).toEqual({ kind: "open-flight", pinnedUrl: "pin.jpg", scrimSolid: true })
        expect(shell.openPhase()).toBe("opening")
        expect(shell.scrimSolid()).toBe(true)
        expect(shell.mediaRevealed()).toBe(false)

        await land!()
        expect(shell.phase()).toEqual({ kind: "ready" })
        expect(shell.openPhase()).toBe("open")
        expect(shell.scrimSolid()).toBe(true)
        expect(shell.mediaRevealed()).toBe(true)
        expect(shell.pinnedPreviewUrl()).toBeNull()
        await started
        shell.destroy()
    })

    it("scrimSolid is false at start, true after open tick, false while closing", async () => {
        let land: (() => void | Promise<void>) | undefined
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => true,
            getOpenPinnedUrl: () => "pin.jpg",
            runOpenGhost: ({ onLand }) => {
                land = onLand
                return true
            },
            runCloseGhost: () => false,
            onFinishClose: () => {},
        })
        expect(shell.scrimSolid()).toBe(false)
        expect(shell.openPhase()).toBe("opening")

        let started = shell.startOpen()
        expect(shell.scrimSolid()).toBe(false)
        expect(shell.openPhase()).toBe("opening")
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
        expect(shell.scrimSolid()).toBe(true)
        expect(shell.openPhase()).toBe("opening")

        await land!()
        expect(shell.scrimSolid()).toBe(true)
        expect(shell.openPhase()).toBe("open")
        await started

        void shell.requestClose()
        expect(shell.scrimSolid()).toBe(false)
        expect(shell.openPhase()).toBe("closing")
        shell.destroy()
    })

    it("ghost skip requestClose calls onFinishClose sync", () => {
        let finish = vi.fn()
        let cancel = vi.fn()
        let shell = createMediaShell({
            skipGhost: () => true,
            hasOpenOrigin: () => false,
            cancelGhost: cancel,
            onFinishClose: finish,
        })
        void shell.requestClose()
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(finish).toHaveBeenCalledTimes(1)
        shell.destroy()
    })

    it("trackContentKey after markNav key then swipe skips switch dir", () => {
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => false,
            onFinishClose: () => {},
        })
        shell.trackContentKey("0:a")
        expect(shell.switchDir()).toBe("none")
        expect(shell.switchAnimKey()).toBe(0)

        shell.markNav("key")
        shell.trackContentKey("1:b")
        expect(shell.switchDir()).toBe("newer")
        expect(shell.switchAnimKey()).toBe(1)

        shell.markNav("key")
        shell.trackContentKey("0:a")
        expect(shell.switchDir()).toBe("older")

        shell.markNav("jump")
        shell.trackContentKey("4:z")
        expect(shell.switchDir()).toBe("jump")

        shell.markNav("swipe")
        shell.trackContentKey("5:z")
        expect(shell.switchDir()).toBe("none")
        expect(shell.switchAnimKey()).toBe(4)
        shell.destroy()
    })

    it("trackContentKey still sets switch dir when skipGhost is true", () => {
        let shell = createMediaShell({
            skipGhost: () => true,
            hasOpenOrigin: () => false,
            onFinishClose: () => {},
        })
        shell.trackContentKey("0:a")
        shell.markNav("key")
        shell.trackContentKey("1:b")
        expect(shell.switchDir()).toBe("newer")
        shell.markNav("jump")
        shell.trackContentKey("4:z")
        expect(shell.switchDir()).toBe("jump")
        shell.destroy()
    })

    it("requestClose without a close ghost waits MEDIA_CLOSE_MS", async () => {
        vi.useFakeTimers()
        let finish = vi.fn()
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => true,
            runCloseGhost: () => false,
            onFinishClose: finish,
        })
        let closed = shell.requestClose()
        expect(shell.phase()).toEqual({ kind: "close-flight" })
        expect(shell.openPhase()).toBe("closing")
        expect(shell.mediaRevealed()).toBe(true)
        expect(finish).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(MEDIA_CLOSE_MS)
        await closed
        expect(finish).toHaveBeenCalledTimes(1)
        expect(MEDIA_OPEN_MS).toBe(500)
        expect(MEDIA_CLOSE_MS).toBe(250)
        expect(MEDIA_CHROME_MS).toBe(200)
        expect(MEDIA_SWITCH_MS).toBe(320)
        shell.destroy()
    })

    it("requestClose during open ghost keeps close-flight if onLand or failed ghost fire later", async () => {
        let land: (() => void | Promise<void>) | undefined
        let finishOpen: ((ran: boolean) => void) | undefined
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => true,
            runOpenGhost: ({ onLand }) => {
                land = onLand
                return new Promise((resolve) => {
                    finishOpen = resolve
                })
            },
            runCloseGhost: () => new Promise(() => {}),
            onFinishClose: () => {},
        })
        let started = shell.startOpen()
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
        expect(shell.phase().kind).toBe("open-flight")

        void shell.requestClose()
        expect(shell.phase()).toEqual({ kind: "close-flight" })

        await land!()
        expect(shell.phase()).toEqual({ kind: "close-flight" })

        finishOpen!(false)
        await started
        expect(shell.phase()).toEqual({ kind: "close-flight" })
        expect(shell.openPhase()).toBe("closing")
        shell.destroy()
    })

    it("throwing open ghost recovers to ready if still opening", async () => {
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => true,
            runOpenGhost: () => {
                throw new Error("ghost failed")
            },
            onFinishClose: () => {},
        })
        await expect(shell.startOpen()).resolves.toBeUndefined()
        expect(shell.phase()).toEqual({ kind: "ready" })
        expect(shell.openPhase()).toBe("open")
        shell.destroy()
    })

    it("opaque content keys use lastNav for switch dir, not Number(head)", () => {
        let last: "prev" | "next" | "key" | "swipe" | "jump" | null = "next"
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => false,
            onFinishClose: () => {},
            lastNav: () => last,
        })
        shell.trackContentKey("file-abc")
        shell.trackContentKey("file-def")
        expect(shell.switchDir()).toBe("newer")

        last = "prev"
        shell.trackContentKey("file-abc")
        expect(shell.switchDir()).toBe("older")

        shell.markNav("key")
        last = "prev"
        shell.trackContentKey("file-other")
        expect(shell.switchDir()).toBe("older")

        last = "swipe"
        shell.trackContentKey("file-swipe")
        expect(shell.switchDir()).toBe("none")
        shell.destroy()
    })

    it("markNav is consumed so the next switch can read lastNav()", () => {
        let last: "key" | "swipe" | "jump" | "prev" | "next" | null = "key"
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => false,
            onFinishClose: () => {},
            lastNav: () => last,
        })
        shell.trackContentKey("0:a")
        shell.trackContentKey("1:b")
        expect(shell.switchDir()).toBe("newer")

        shell.markNav("jump")
        shell.trackContentKey("4:z")
        expect(shell.switchDir()).toBe("jump")

        last = "swipe"
        shell.trackContentKey("5:z")
        expect(shell.switchDir()).toBe("none")
        shell.destroy()
    })

    it("forceClose cancels ghost and finishes immediately", () => {
        let finish = vi.fn()
        let cancel = vi.fn()
        let shell = createMediaShell({
            skipGhost: () => false,
            hasOpenOrigin: () => true,
            cancelGhost: cancel,
            onFinishClose: finish,
        })
        shell.forceClose()
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(finish).toHaveBeenCalledTimes(1)
        shell.destroy()
    })
})
