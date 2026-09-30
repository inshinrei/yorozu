// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachMediaViewer } from "./index"
import { createMediaViewer } from "../session"
import type { MediaViewerChromeApi } from "../types"
import {
    DecodeFn,
    img,
    imgAspect,
    mountAttach,
    origin,
    pointer,
    teardownAttach,
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

    it("chrome header mount receives api and api.close({ ghost: false }) removes overlay", () => {
        let api: MediaViewerChromeApi | undefined
        let headerEl: HTMLElement | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (el, chromeApi) => {
                    headerEl = el
                    api = chromeApi
                },
            },
        })
        expect(headerEl?.getAttribute("data-yorozu-media-header")).toBe("")
        expect(api).toBeTruthy()
        api!.close({ ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        expect(viewer.snapshot().open).toBe(false)
    })

    it("keyboard ArrowRight moves index when not zoomed", () => {
        viewer.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.snapshot().current?.id).toBe("b")
    })

    it('ArrowRight sets lastNav to "next" for opaque ids', () => {
        viewer.open({ items: [img("aa"), img("bb")], index: 0 })
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.lastNav()).toBe("next")
    })

    it('chrome api next/prev set lastNav to "next"/"prev" for opaque ids', () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("aa"), img("bb")],
            index: 0,
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        api!.next()
        expect(viewer.snapshot().index).toBe(1)
        expect(viewer.lastNav()).toBe("next")
        api!.prev()
        expect(viewer.snapshot().index).toBe(0)
        expect(viewer.lastNav()).toBe("prev")
    })

    it("chrome api exposes scale and percentLabel", () => {
        let api: MediaViewerChromeApi | undefined
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                },
            },
        })
        expect(api!.percentLabel()).toBe("100%")
        expect(api!.scale()).toBe(1)
        api!.zoomIn()
        expect(api!.scale()).toBe(1.25)
        expect(api!.percentLabel()).toBe("125%")
    })

    it("chrome onZoomChange fires on zoomIn and not on session identity", () => {
        let api: MediaViewerChromeApi | undefined
        let zoomTicks = 0
        let sessionTicks = 0
        viewer.subscribe(() => {
            sessionTicks += 1
        })
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                    return chromeApi.onZoomChange(() => {
                        zoomTicks += 1
                    })
                },
            },
        })
        let afterOpen = sessionTicks
        api!.zoomIn()
        expect(api!.scale()).toBe(1.25)
        expect(zoomTicks).toBeGreaterThanOrEqual(1)
        expect(sessionTicks).toBe(afterOpen)
    })

    it("chrome onZoomChange from a closed overlay does not fire after reopen", () => {
        let api: MediaViewerChromeApi | undefined
        let firstTicks = 0
        let secondTicks = 0
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                    chromeApi.onZoomChange(() => {
                        firstTicks += 1
                    })
                },
            },
        })
        api!.zoomIn()
        expect(firstTicks).toBeGreaterThanOrEqual(1)
        let afterFirstZoom = firstTicks
        api!.close({ ghost: false })
        expect(root.querySelector("[data-yorozu-media-viewer]")).toBeNull()
        viewer.open({
            items: [img("a")],
            chrome: {
                header: (_el, chromeApi) => {
                    api = chromeApi
                    chromeApi.onZoomChange(() => {
                        secondTicks += 1
                    })
                },
            },
        })
        api!.zoomIn()
        expect(firstTicks).toBe(afterFirstZoom)
        expect(secondTicks).toBeGreaterThanOrEqual(1)
    })

    it("re-open remounts chrome of the same identity and restarts open phase", () => {
        let mounts = 0
        let unmounts = 0
        let header = (): (() => void) => {
            mounts += 1
            return () => {
                unmounts += 1
            }
        }
        viewer.open({ items: [img("a")], origin, ghost: false, chrome: { header } })
        expect(mounts).toBe(1)
        expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("open")
        viewer.open({ items: [img("b")], origin, chrome: { header } })
        expect(mounts).toBe(2)
        expect(unmounts).toBe(1)
        expect(root.querySelector("[data-yorozu-media-viewer]")?.getAttribute("data-phase")).toBe("opening")
    })
})
