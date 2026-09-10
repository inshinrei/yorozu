// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    computeStageFitRectFromElement,
    createMediaGhost,
    DEFAULT_MEDIA_INSETS,
    MEDIA_GHOST_ANIMATING_CLASS,
    MEDIA_GHOST_HANDOFF_CLASS,
    MEDIA_GHOST_END_MS,
    MEDIA_GHOST_MS,
} from "./ghost"
import type { MediaViewerOrigin } from "./types"

function fakeRect(left: number, top: number, width: number, height: number): DOMRect {
    return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON() {
            return {}
        },
    }
}

let seed: MediaViewerOrigin = {
    id: "a",
    rect: { top: 10, left: 20, width: 40, height: 40 },
    imageUrl: "https://cdn.example/a.jpg",
    objectFit: "cover",
    naturalWidth: 200,
    naturalHeight: 200,
}

let to = { top: 100, left: 80, width: 200, height: 200 }

describe("createMediaGhost", () => {
    let animate: ReturnType<typeof vi.fn>
    let host: HTMLElement
    let ghost: ReturnType<typeof createMediaGhost>

    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            "requestAnimationFrame",
            (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
        )
        animate = vi.fn(() => ({
            finished: Promise.resolve(),
            cancel: vi.fn(),
        }))
        HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate
        host = document.createElement("div")
        document.body.append(host)
        ghost = createMediaGhost()
    })

    afterEach(() => {
        ghost.cancel()
        host.remove()
        document.documentElement.classList.remove(MEDIA_GHOST_ANIMATING_CLASS, MEDIA_GHOST_HANDOFF_CLASS)
        vi.useRealTimers()
        vi.unstubAllGlobals()
        Reflect.deleteProperty(HTMLElement.prototype, "animate")
    })

    it("playOpen adds the animating class and stamps the ghost clone", () => {
        let hideTarget = document.createElement("div")
        hideTarget.style.visibility = "visible"
        host.append(hideTarget)
        let handle = ghost.playOpen({ host, seed, to, hideTarget })
        expect(handle).not.toBeNull()
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(true)
        let clone = host.querySelector("[data-yorozu-media-ghost]") as HTMLElement
        expect(clone).toBeTruthy()
        expect(clone.getAttribute("data-yorozu-media-ghost")).toBe("")
        expect(hideTarget.style.visibility).toBe("hidden")
        expect(MEDIA_GHOST_MS).toBe(200)
        expect(MEDIA_GHOST_END_MS).toBe(16)
    })

    it("calls onLand with the handoff class, then clears classes when done", async () => {
        let duringLand = { animating: false, handoff: false }
        let onLand = vi.fn(() => {
            duringLand.animating = document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)
            duringLand.handoff = document.documentElement.classList.contains(MEDIA_GHOST_HANDOFF_CLASS)
        })
        let handle = ghost.playOpen({ host, seed, to, onLand })
        await vi.runAllTimersAsync()
        expect(onLand).toHaveBeenCalledTimes(1)
        expect(duringLand.animating).toBe(true)
        expect(duringLand.handoff).toBe(true)
        expect(await handle!.done).toBe(true)
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(false)
        expect(document.documentElement.classList.contains(MEDIA_GHOST_HANDOFF_CLASS)).toBe(false)
        expect(host.querySelector("[data-yorozu-media-ghost]")).toBeNull()
    })

    it("cancel removes the clone", () => {
        let handle = ghost.playOpen({ host, seed, to })
        expect(host.querySelector("[data-yorozu-media-ghost]")).toBeTruthy()
        handle!.cancel()
        expect(host.querySelector("[data-yorozu-media-ghost]")).toBeNull()
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(false)
    })

    it("playClose does not auto-clear the animating class when done", async () => {
        let handle = ghost.playClose({
            host,
            fromStage: to,
            target: seed,
        })
        expect(handle).not.toBeNull()
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(true)
        expect(host.querySelector("[data-yorozu-media-ghost]")).toBeTruthy()
        await vi.runAllTimersAsync()
        expect(await handle!.done).toBe(true)
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(true)
        ghost.cancel()
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(false)
        expect(host.querySelector("[data-yorozu-media-ghost]")).toBeNull()
    })
})

describe("computeStageFitRectFromElement", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("fits contain into the padded client rect", () => {
        let stage = document.createElement("div")
        vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(fakeRect(10, 20, 800, 600))
        vi.spyOn(window, "getComputedStyle").mockReturnValue({
            paddingTop: "52px",
            paddingRight: "12px",
            paddingBottom: "52px",
            paddingLeft: "12px",
        } as CSSStyleDeclaration)
        expect(DEFAULT_MEDIA_INSETS).toEqual({ top: 52, right: 12, bottom: 52, left: 12 })
        expect(computeStageFitRectFromElement(stage, { width: 1000, height: 500 })).toEqual({
            top: 126,
            left: 22,
            width: 776,
            height: 388,
        })
    })
})
