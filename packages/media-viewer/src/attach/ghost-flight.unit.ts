// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import {
    MEDIA_GHOST_ANIMATING_CLASS,
    MEDIA_GHOST_CLOSE_EASING,
    MEDIA_GHOST_CLOSE_MS,
    MEDIA_GHOST_EASING,
    MEDIA_GHOST_MS,
} from "../ghost"
import type { MediaViewerChromeApi } from "../types"
import {
    DecodeFn,
    img,
    imgAspect,
    mountAttach,
    origin,
    pointer,
    teardownAttach,
    fakeRect,
    stampOriginThumb,
    trapVisibility,
    type AttachTestMount,
} from "./test-helpers"

describe("attachMediaViewer", () => {
    let viewer: AttachTestMount["viewer"]
    let root: HTMLElement
    let stop: (() => void) | undefined
    let animate: AttachTestMount["animate"]
    let onIndexChange: AttachTestMount["onIndexChange"]

    beforeEach(() => {
        let mount = mountAttach()
        viewer = mount.viewer
        root = mount.root
        stop = mount.stop
        animate = mount.animate
        onIndexChange = mount.onIndexChange
    })

    afterEach(() => {
        teardownAttach({ viewer, root, stop, animate, onIndexChange })
    })

    function lastCloseKeyframes(): Keyframe[] {
        let call = animate.mock.calls.at(-1)
        expect(call).toBeTruthy()
        return call![0] as Keyframe[]
    }

    it("open({ ghost: false, origin }) does not add yorozu-media-ghost-animating", () => {
        viewer.open({ items: [img("a")], origin, ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeTruthy()
        expect(document.documentElement.classList.contains("yorozu-media-ghost-animating")).toBe(false)
        expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(false)
        expect(animate).not.toHaveBeenCalled()
    })

    it("open ghost uses the stage img as bitmap and does not steal the stage node", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        viewer.open({
            items: [img("a", "blob:stage-a")],
            origin: { ...origin, imageUrl: "https://cdn.example/thumb.jpg" },
            ghost: true,
        })
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost] img")).toBeTruthy()
        })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage).toBeInstanceOf(HTMLImageElement)
        expect(stage.src).toContain("blob:stage-a")
        let cloneImg = ghostHost.querySelector("[data-yorozu-media-ghost] img") as HTMLImageElement
        expect(cloneImg).not.toBe(stage)
        expect(cloneImg.src).toContain("blob:stage-a")
        expect(cloneImg.src).not.toContain("cdn.example")
        expect(root.querySelector("[data-yorozu-media-stage]")).toBe(stage)
        ghostHost.remove()
    })

    it("open ghost play uses MEDIA_GHOST_MS and MEDIA_GHOST_EASING", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        viewer.open({
            items: [img("a")],
            origin,
            ghost: true,
        })
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost]")).toBeTruthy()
        })
        await vi.waitFor(() => {
            expect(animate.mock.calls.length).toBeGreaterThan(0)
            expect(animate.mock.calls.at(-1)?.[1]).toMatchObject({
                duration: MEDIA_GHOST_MS,
                easing: MEDIA_GHOST_EASING,
                fill: "forwards",
            })
        })
        ghostHost.remove()
    })

    it("video open ghost does not use a neighbor peek as bitmap", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        viewer.open({
            items: [{ id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" }, img("b", "neighbor-b.jpg")],
            index: 0,
            origin: { ...origin, id: "v", imageUrl: "https://cdn.example/video-thumb.jpg" },
            ghost: true,
            neighbors: {
                older: null,
                newer: { id: "b", kind: "image", src: "neighbor-b.jpg" },
            },
        })
        expect(root.querySelector('[data-side="newer"] [data-yorozu-media-peek]')).toBeTruthy()
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost] img")).toBeTruthy()
        })
        let cloneImg = ghostHost.querySelector("[data-yorozu-media-ghost] img") as HTMLImageElement
        expect(cloneImg.src).not.toContain("neighbor-b")
        expect(cloneImg.src).toContain("video-thumb")
        ghostHost.remove()
    })

    it("origin open stays opening until ghost lands; data-scrim follows the open tick", async () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            origin,
            ghost: true,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        let overlay = root.querySelector("[data-yorozu-media-viewer]") as HTMLElement
        expect(overlay.getAttribute("data-phase")).toBe("opening")
        expect(overlay.hasAttribute("data-scrim")).toBe(false)

        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
        expect(overlay.getAttribute("data-phase")).toBe("opening")
        expect(overlay.hasAttribute("data-scrim")).toBe(true)

        await vi.waitFor(() => {
            expect(document.documentElement.classList.contains("yorozu-media-ghost-animating")).toBe(true)
            expect(overlay.getAttribute("data-phase")).toBe("opening")
        })

        await vi.waitFor(() => {
            expect(overlay.getAttribute("data-phase")).toBe("open")
        })
        expect(overlay.hasAttribute("data-scrim")).toBe(true)

        api!.close()
        expect(overlay.getAttribute("data-phase")).toBe("closing")
        expect(overlay.hasAttribute("data-scrim")).toBe(false)
        expect(document.documentElement.classList.contains("yorozu-media-ghost-animating")).toBe(true)
    })

    it("hides the origin thumb after ghost takeoff and restores it after close", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        let thumb = document.createElement("img")
        thumb.setAttribute("data-media-origin", "a")
        thumb.style.visibility = "visible"
        document.body.append(thumb)
        try {
            viewer.open({
                items: [img("a")],
                origin,
                ghost: true,
                chrome: {
                    header: (_el, chromeApi) => {
                        api = chromeApi
                    },
                },
            })
            await vi.waitFor(() => {
                expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(true)
            })
            expect(ghostHost.querySelector("[data-yorozu-media-ghost]")).toBeTruthy()
            expect(thumb.style.visibility).toBe("hidden")

            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
            })
            expect(thumb.style.visibility).toBe("hidden")

            api!.close()
            expect(thumb.style.visibility).toBe("hidden")
            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
            })
            expect(thumb.style.visibility).toBe("visible")
        } finally {
            thumb.remove()
            ghostHost.remove()
        }
    })

    it("hides the origin thumb only after the ghost clone is in the host", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let thumb = document.createElement("img")
        thumb.setAttribute("data-media-origin", "a")
        thumb.style.visibility = "visible"
        document.body.append(thumb)
        let atHide = { seen: false, clone: null as Element | null }
        let stopTrap = trapVisibility(thumb, (value) => {
            if (value !== "hidden") return
            atHide.seen = true
            atHide.clone = ghostHost.querySelector("[data-yorozu-media-ghost]")
        })
        try {
            viewer.open({ items: [img("a")], origin, ghost: true })
            await vi.waitFor(() => {
                expect(atHide.seen).toBe(true)
            })
            expect(atHide.clone).toBeTruthy()
            expect(thumb.style.visibility).toBe("hidden")
            expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(true)
        } finally {
            stopTrap()
            thumb.remove()
            ghostHost.remove()
        }
    })

    it("does not hide the origin thumb when open ghost fails to start", async () => {
        let thumb = document.createElement("img")
        thumb.setAttribute("data-media-origin", "a")
        thumb.style.visibility = "visible"
        document.body.append(thumb)
        let hid = false
        let stopTrap = trapVisibility(thumb, (value) => {
            if (value === "hidden") hid = true
        })
        try {
            viewer.open({
                items: [img("a")],
                origin: { ...origin, rect: { top: 0, left: 0, width: 0, height: 0 } },
                ghost: true,
            })
            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
            })
            expect(hid).toBe(false)
            expect(thumb.style.visibility).toBe("visible")
            expect(document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS)).toBe(false)
        } finally {
            stopTrap()
            thumb.remove()
        }
    })

    it("restores origin visibility while the close ghost clone is still mounted", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        let thumb = document.createElement("img")
        thumb.setAttribute("data-media-origin", "a")
        thumb.style.visibility = "visible"
        document.body.append(thumb)
        try {
            viewer.open({
                items: [img("a")],
                origin,
                ghost: true,
                chrome: {
                    header: (_el, chromeApi) => {
                        api = chromeApi
                    },
                },
            })
            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
            })
            expect(thumb.style.visibility).toBe("hidden")
            let atUncover = { seen: false, clone: null as Element | null }
            let stopTrap = trapVisibility(thumb, (value) => {
                if (value !== "visible") return
                atUncover.seen = true
                atUncover.clone = ghostHost.querySelector("[data-yorozu-media-ghost]")
            })
            try {
                api!.close()
                await vi.waitFor(() => {
                    expect(atUncover.seen).toBe(true)
                })
                expect(atUncover.clone).toBeTruthy()
            } finally {
                stopTrap()
            }
        } finally {
            thumb.remove()
            ghostHost.remove()
        }
    })

    it("does not hide the origin thumb when ghost is skipped", () => {
        let thumb = document.createElement("img")
        thumb.setAttribute("data-media-origin", "a")
        thumb.style.visibility = "visible"
        document.body.append(thumb)
        try {
            viewer.open({ items: [img("a")], origin, ghost: false })
            expect(thumb.style.visibility).toBe("visible")
        } finally {
            thumb.remove()
        }
    })

    it("close ghost uses the stage img as bitmap and does not steal the stage node", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a", "blob:stage-a")],
            origin: { ...origin, imageUrl: "https://cdn.example/thumb.jpg" },
            ghost: true,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        await vi.waitFor(() => {
            expect(root.querySelector("[data-yorozu-media-stage]")).toBeTruthy()
        })
        api!.close()
        await vi.waitFor(() => {
            expect(ghostHost.querySelector("[data-yorozu-media-ghost] img")).toBeTruthy()
        })
        let stage = root.querySelector("[data-yorozu-media-stage]") as HTMLImageElement
        expect(stage).toBeInstanceOf(HTMLImageElement)
        let cloneImg = ghostHost.querySelector("[data-yorozu-media-ghost] img") as HTMLImageElement
        expect(cloneImg).not.toBe(stage)
        expect(cloneImg.src).toContain("blob:stage-a")
        expect(cloneImg.src).not.toContain("cdn.example")
        expect(root.querySelector("[data-yorozu-media-stage]")).toBe(stage)
        ghostHost.remove()
    })

    it("close ghost play uses MEDIA_GHOST_CLOSE_MS and MEDIA_GHOST_CLOSE_EASING", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            origin,
            ghost: true,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        await vi.waitFor(() => {
            expect(root.querySelector("[data-yorozu-media-stage]")).toBeTruthy()
        })
        animate.mockClear()
        api!.close()
        await vi.waitFor(() => {
            expect(animate.mock.calls.length).toBeGreaterThan(0)
            expect(animate.mock.calls.at(-1)?.[1]).toMatchObject({
                duration: MEDIA_GHOST_CLOSE_MS,
                easing: MEDIA_GHOST_CLOSE_EASING,
                fill: "forwards",
            })
        })
        ghostHost.remove()
    })

    it("close ghost flies when the live origin is fully on-screen", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        let thumb = stampOriginThumb("a", { left: 80, top: 10, width: 40, height: 40 })
        let atUncover = { seen: false, clone: null as Element | null, left: "", top: "" }
        let stopTrap = trapVisibility(thumb, (value) => {
            if (value !== "visible") return
            atUncover.seen = true
            let clone = ghostHost.querySelector("[data-yorozu-media-ghost]") as HTMLElement | null
            atUncover.clone = clone
            atUncover.left = clone?.style.left ?? ""
            atUncover.top = clone?.style.top ?? ""
        })
        try {
            viewer.open({
                items: [img("a")],
                origin,
                ghost: true,
                chrome: {
                    header: (_el, chromeApi) => {
                        api = chromeApi
                    },
                },
            })
            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
            })
            animate.mockClear()
            api!.close()
            await vi.waitFor(() => {
                expect(animate.mock.calls.length).toBeGreaterThan(0)
            })
            let frames = lastCloseKeyframes()
            expect(frames[1]?.opacity).not.toBe("0")
            expect(frames[0]?.transform).not.toBe("translate3d(0px, 0px, 0) scale(1, 1)")
            expect(animate.mock.calls.at(-1)?.[1]).toMatchObject({
                duration: MEDIA_GHOST_CLOSE_MS,
                easing: MEDIA_GHOST_CLOSE_EASING,
                fill: "forwards",
            })
            await vi.waitFor(() => {
                expect(atUncover.seen).toBe(true)
            })
            expect(atUncover.clone).toBeTruthy()
            expect(atUncover.left).toBe("80px")
            expect(atUncover.top).toBe("10px")
        } finally {
            stopTrap()
            thumb.remove()
            ghostHost.remove()
        }
    })

    it("close ghost fades in place when the live origin is 2px past the window", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        let thumb = stampOriginThumb("a", { left: 20, top: -2, width: 40, height: 40 })
        try {
            viewer.open({
                items: [img("a")],
                origin,
                ghost: true,
                chrome: {
                    header: (_el, chromeApi) => {
                        api = chromeApi
                    },
                },
            })
            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
            })
            animate.mockClear()
            api!.close()
            await vi.waitFor(() => {
                expect(animate.mock.calls.length).toBeGreaterThan(0)
            })
            let frames = lastCloseKeyframes()
            expect(frames[1]?.opacity).toBe("0")
            expect(frames[0]?.transform).toBe("translate3d(0px, 0px, 0) scale(1, 1)")
        } finally {
            thumb.remove()
            ghostHost.remove()
        }
    })

    it("close ghost fades in place when the clip root clips the origin", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        let clip = document.createElement("div")
        document.body.append(clip)
        vi.spyOn(clip, "getBoundingClientRect").mockReturnValue(fakeRect(0, 0, 200, 48))
        stop?.()
        stop = attachMediaViewer(viewer, root, {
            getGhostHost: () => ghostHost,
            getHistoryClipRoot: () => clip,
        })
        let api: MediaViewerChromeApi | undefined
        let thumb = stampOriginThumb("a", { left: 10, top: 10, width: 40, height: 40 })
        try {
            viewer.open({
                items: [img("a")],
                origin,
                ghost: true,
                chrome: {
                    header: (_el, chromeApi) => {
                        api = chromeApi
                    },
                },
            })
            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
            })
            animate.mockClear()
            api!.close()
            await vi.waitFor(() => {
                expect(animate.mock.calls.length).toBeGreaterThan(0)
            })
            let frames = lastCloseKeyframes()
            expect(frames[1]?.opacity).toBe("0")
            expect(frames[0]?.transform).toBe("translate3d(0px, 0px, 0) scale(1, 1)")
        } finally {
            thumb.remove()
            clip.remove()
            ghostHost.remove()
        }
    })

    it("close ghost flies when the clip root fully contains the origin", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        let clip = document.createElement("div")
        document.body.append(clip)
        vi.spyOn(clip, "getBoundingClientRect").mockReturnValue(fakeRect(0, 0, 400, 300))
        stop?.()
        stop = attachMediaViewer(viewer, root, {
            getGhostHost: () => ghostHost,
            getHistoryClipRoot: () => clip,
        })
        let api: MediaViewerChromeApi | undefined
        let thumb = stampOriginThumb("a", { left: 80, top: 10, width: 40, height: 40 })
        try {
            viewer.open({
                items: [img("a")],
                origin,
                ghost: true,
                chrome: {
                    header: (_el, chromeApi) => {
                        api = chromeApi
                    },
                },
            })
            await vi.waitFor(() => {
                expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
            })
            animate.mockClear()
            api!.close()
            await vi.waitFor(() => {
                expect(animate.mock.calls.length).toBeGreaterThan(0)
            })
            let frames = lastCloseKeyframes()
            expect(frames[1]?.opacity).not.toBe("0")
            expect(frames[0]?.transform).not.toBe("translate3d(0px, 0px, 0) scale(1, 1)")
        } finally {
            thumb.remove()
            clip.remove()
            ghostHost.remove()
        }
    })

    it("close ghost fades in place when there is no live origin, even if open seed is on-screen", async () => {
        let ghostHost = document.createElement("div")
        document.body.append(ghostHost)
        stop?.()
        stop = attachMediaViewer(viewer, root, { getGhostHost: () => ghostHost })
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            origin,
            ghost: true,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        await vi.waitFor(() => {
            expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
        })
        animate.mockClear()
        api!.close()
        await vi.waitFor(() => {
            expect(animate.mock.calls.length).toBeGreaterThan(0)
        })
        let frames = lastCloseKeyframes()
        expect(frames[1]?.opacity).toBe("0")
        expect(frames[0]?.transform).toBe("translate3d(0px, 0px, 0) scale(1, 1)")
        ghostHost.remove()
    })

    it("close ghost still plays when stage fit is null", async () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            origin,
            ghost: true,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        expect(viewer.beginClose()).toBe(true)
        let before = animate.mock.calls.length
        api!.close()
        let overlay = root.querySelector("[data-yorozu-media-viewer]")
        expect(
            document.documentElement.classList.contains(MEDIA_GHOST_ANIMATING_CLASS) ||
                overlay?.getAttribute("data-phase") === "closing",
        ).toBe(true)
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve())
            })
        })
        expect(animate.mock.calls.length).toBeGreaterThan(before)
    })
})
