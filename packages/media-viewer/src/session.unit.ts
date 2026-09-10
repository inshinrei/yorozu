import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMediaViewer, MEDIA_FILMSTRIP_MAX_WIDTH_DEFAULT, type MediaViewer, type MediaViewerItem } from "./session"

function img(id: string, src: string | null = `${id}.jpg`): MediaViewerItem {
    return { id, kind: "image", src }
}

describe("createMediaViewer", () => {
    let viewer: MediaViewer | undefined
    let onClose: ReturnType<typeof vi.fn>
    let onIndexChange: ReturnType<typeof vi.fn>
    let onRequestOlder: ReturnType<typeof vi.fn>
    let onRequestNewer: ReturnType<typeof vi.fn>

    beforeEach(() => {
        onClose = vi.fn()
        onIndexChange = vi.fn()
        onRequestOlder = vi.fn()
        onRequestNewer = vi.fn()
        viewer = createMediaViewer({ onClose, onIndexChange, onRequestOlder, onRequestNewer })
    })

    afterEach(() => {
        viewer?.destroy()
        viewer = undefined
    })

    it("starts closed with empty snapshot", () => {
        let snap = viewer!.snapshot()
        expect(snap).toEqual({
            open: false,
            items: [],
            index: 0,
            current: null,
            neighbors: { older: null, newer: null },
            canOlder: false,
            canNewer: false,
            origin: null,
            ghost: false,
            filmstrip: false,
            filmstripMaxWidth: MEDIA_FILMSTRIP_MAX_WIDTH_DEFAULT,
        })
        expect(MEDIA_FILMSTRIP_MAX_WIDTH_DEFAULT).toBe("36%")
        expect(viewer!.snapshot()).not.toBe(viewer!.snapshot())
        expect(viewer!.chrome()).toBeNull()
        expect(viewer!.lastNav()).toBeNull()
        expect(viewer!.wantsGhost("open")).toBe(false)
    })

    it("open copies items, clamps index, derives neighbors", () => {
        let a = img("a")
        let b = img("b")
        let c = img("c")
        viewer!.open({ items: [a, b, c], index: 1 })
        let snap = viewer!.snapshot()
        expect(snap.open).toBe(true)
        expect(snap.items).toEqual([a, b, c])
        expect(snap.items).not.toBe([a, b, c] as unknown as typeof snap.items)
        expect(snap.items[1]).toBe(b)
        expect(snap.index).toBe(1)
        expect(snap.current).toBe(b)
        expect(snap.neighbors).toEqual({
            older: { id: "a", kind: "image", src: "a.jpg" },
            newer: { id: "c", kind: "image", src: "c.jpg" },
        })
        expect(snap.canOlder).toBe(true)
        expect(snap.canNewer).toBe(true)
        expect(snap.ghost).toBe(false)
        viewer!.open({ items: [a], index: 9 })
        expect(viewer!.snapshot().index).toBe(0)
    })

    it("derived neighbors copy poster when present on the item", () => {
        viewer!.open({
            items: [
                img("a"),
                { id: "v", kind: "video", src: "v.mp4", poster: "p.jpg" },
                { id: "w", kind: "video", src: "w.mp4" },
            ],
            index: 0,
        })
        expect(viewer!.snapshot().neighbors.newer).toEqual({
            id: "v",
            kind: "video",
            src: "v.mp4",
            poster: "p.jpg",
        })
        viewer!.goTo(1)
        expect(viewer!.snapshot().neighbors.newer).toEqual({
            id: "w",
            kind: "video",
            src: "w.mp4",
        })
        expect(viewer!.snapshot().neighbors.newer).not.toHaveProperty("poster")
    })

    it("open with origin enables ghost unless ghost:false or reduced motion", () => {
        let origin = {
            id: "a",
            rect: { top: 0, left: 0, width: 10, height: 10 },
            imageUrl: "a.jpg",
            objectFit: "cover" as const,
        }
        viewer!.open({ items: [img("a")], origin })
        expect(viewer!.snapshot().ghost).toBe(true)
        expect(viewer!.snapshot().origin).toEqual(origin)
        expect(viewer!.wantsGhost("open")).toBe(true)
        viewer!.open({ items: [img("a")], origin, ghost: false })
        expect(viewer!.snapshot().ghost).toBe(false)
        expect(viewer!.wantsGhost("open")).toBe(false)
        let reduced = createMediaViewer({ prefersReducedMotion: () => true })
        reduced.open({ items: [img("a")], origin })
        expect(reduced.wantsGhost("open")).toBe(false)
        expect(reduced.snapshot().ghost).toBe(true)
        reduced.destroy()
    })

    it("beginClose returns whether close ghost should run and close({ghost:false}) skips", () => {
        let origin = {
            id: "a",
            rect: { top: 0, left: 0, width: 10, height: 10 },
            imageUrl: "a.jpg",
            objectFit: "contain" as const,
        }
        viewer!.open({ items: [img("a")], origin })
        expect(viewer!.beginClose()).toBe(true)
        expect(viewer!.snapshot().open).toBe(true)
        expect(viewer!.wantsGhost("close")).toBe(true)
        viewer!.close()
        expect(viewer!.snapshot().open).toBe(false)
        expect(viewer!.snapshot().current?.id).toBe("a")
        expect(onClose).toHaveBeenCalledTimes(1)
        viewer!.close()
        expect(onClose).toHaveBeenCalledTimes(1)

        viewer!.open({ items: [img("a")], origin })
        expect(viewer!.beginClose({ ghost: false })).toBe(false)
        expect(viewer!.wantsGhost("close")).toBe(false)
        viewer!.forceClose()
        expect(viewer!.snapshot().open).toBe(false)
        expect(onClose).toHaveBeenCalledTimes(2)
    })

    it("prev/next move in-window or request edges; swipe lastNav is distinct", () => {
        viewer!.open({ items: [img("a"), img("b"), img("c")], index: 1 })
        viewer!.prev()
        expect(viewer!.snapshot().index).toBe(0)
        expect(viewer!.snapshot().current?.id).toBe("a")
        expect(viewer!.lastNav()).toBe("key")
        expect(onIndexChange).toHaveBeenLastCalledWith(0, viewer!.snapshot().current)
        viewer!.prev()
        expect(onRequestOlder).not.toHaveBeenCalled()
        viewer!.setCanNav({ older: true })
        expect(viewer!.snapshot().canOlder).toBe(true)
        viewer!.prev("swipe")
        expect(viewer!.snapshot().index).toBe(0)
        expect(onRequestOlder).toHaveBeenCalledTimes(1)
        expect(viewer!.lastNav()).toBe("swipe")
        viewer!.goTo(2)
        expect(viewer!.lastNav()).toBe("jump")
        viewer!.next("swipe")
        expect(onRequestNewer).not.toHaveBeenCalled()
        viewer!.setCanNav({ newer: true })
        viewer!.next()
        expect(onRequestNewer).toHaveBeenCalledTimes(1)
    })

    it("edge prev/next notify subscribers so lastNav is visible", () => {
        let ticks = 0
        viewer!.subscribe(() => {
            ticks += 1
        })
        viewer!.open({ items: [img("a")], canOlder: true, canNewer: true })
        ticks = 0
        viewer!.prev("swipe")
        expect(onRequestOlder).toHaveBeenCalledTimes(1)
        expect(viewer!.snapshot().index).toBe(0)
        expect(viewer!.lastNav()).toBe("swipe")
        expect(ticks).toBe(1)
        viewer!.next("key")
        expect(onRequestNewer).toHaveBeenCalledTimes(1)
        expect(viewer!.lastNav()).toBe("key")
        expect(ticks).toBe(2)
    })

    it("setItems keeps current id when present; explicit neighbors win including null", () => {
        viewer!.open({ items: [img("a"), img("b")], index: 1 })
        viewer!.setItems([img("x"), img("b"), img("y")])
        expect(viewer!.snapshot().index).toBe(1)
        expect(viewer!.snapshot().current?.id).toBe("b")
        viewer!.setNeighbors({ older: null, newer: { id: "peek", kind: "video", src: null } })
        expect(viewer!.snapshot().neighbors).toEqual({
            older: null,
            newer: { id: "peek", kind: "video", src: null },
        })
        expect(viewer!.snapshot().canNewer).toBe(true)
    })

    it("subscribe notifies on open/nav/close and unsubscribes; destroy is terminal", () => {
        let n = 0
        let stop = viewer!.subscribe(() => {
            n += 1
        })
        viewer!.open({ items: [img("a"), img("b")] })
        viewer!.next()
        stop()
        viewer!.prev()
        expect(n).toBe(2)
        viewer!.destroy()
        let after = n
        viewer!.open({ items: [img("z")] })
        viewer!.destroy()
        expect(viewer!.snapshot().open).toBe(false)
        expect(n).toBeGreaterThanOrEqual(after)
    })

    it("open with empty items is still open with current null", () => {
        viewer!.open({ items: [] })
        let snap = viewer!.snapshot()
        expect(snap.open).toBe(true)
        expect(snap.current).toBeNull()
        expect(snap.items).toEqual([])
        expect(snap.index).toBe(0)
    })

    it("forceClose without beginClose closes and fires onClose once", () => {
        viewer!.open({ items: [img("a")] })
        expect(viewer!.snapshot().open).toBe(true)
        viewer!.forceClose()
        expect(viewer!.snapshot().open).toBe(false)
        expect(onClose).toHaveBeenCalledTimes(1)
        viewer!.forceClose()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("setItems uses the passed index, clamped", () => {
        viewer!.open({ items: [img("a"), img("b"), img("c")], index: 0 })
        viewer!.setItems([img("x"), img("y"), img("z"), img("w")], 2)
        expect(viewer!.snapshot().index).toBe(2)
        expect(viewer!.snapshot().current?.id).toBe("z")
        viewer!.setItems([img("only")], 9)
        expect(viewer!.snapshot().index).toBe(0)
        expect(viewer!.snapshot().current?.id).toBe("only")
        viewer!.setItems([], 3)
        expect(viewer!.snapshot().index).toBe(0)
        expect(viewer!.snapshot().current).toBeNull()
    })

    it("goTo the same index is a no-op", () => {
        viewer!.open({ items: [img("a"), img("b")], index: 1 })
        let ticks = 0
        viewer!.subscribe(() => {
            ticks += 1
        })
        ticks = 0
        viewer!.goTo(1)
        expect(ticks).toBe(0)
        expect(onIndexChange).not.toHaveBeenCalled()
        viewer!.goTo(0)
        expect(ticks).toBe(1)
        expect(onIndexChange).toHaveBeenCalledTimes(1)
    })

    it("reduced motion: wantsGhost close is false even with origin", () => {
        let origin = {
            id: "a",
            rect: { top: 0, left: 0, width: 10, height: 10 },
            imageUrl: "a.jpg",
            objectFit: "cover" as const,
        }
        let reduced = createMediaViewer({ prefersReducedMotion: () => true })
        reduced.open({ items: [img("a")], origin })
        expect(reduced.snapshot().origin).toEqual(origin)
        expect(reduced.wantsGhost("close")).toBe(false)
        expect(reduced.beginClose()).toBe(false)
        reduced.destroy()
    })

    it("subscribe after destroy does not add listeners; double destroy is a no-op", () => {
        let n = 0
        viewer!.open({ items: [img("a"), img("b")] })
        viewer!.destroy()
        let stop = viewer!.subscribe(() => {
            n += 1
        })
        viewer!.open({ items: [img("z")] })
        viewer!.next()
        viewer!.close()
        viewer!.forceClose()
        viewer!.destroy()
        stop()
        expect(n).toBe(0)
        expect(viewer!.snapshot().open).toBe(false)
    })

    it("filmstrip defaults on for 2+ items and off for 0–1", () => {
        expect(viewer!.snapshot().filmstrip).toBe(false)
        viewer!.open({ items: [] })
        expect(viewer!.snapshot().filmstrip).toBe(false)
        viewer!.open({ items: [img("a")] })
        expect(viewer!.snapshot().filmstrip).toBe(false)
        viewer!.open({ items: [img("a"), img("b")] })
        expect(viewer!.snapshot().filmstrip).toBe(true)
        viewer!.open({ items: [img("a"), img("b"), img("c")] })
        expect(viewer!.snapshot().filmstrip).toBe(true)
        viewer!.open({ items: [img("a"), img("b")], filmstrip: false })
        expect(viewer!.snapshot().filmstrip).toBe(false)
        viewer!.open({ items: [img("a")], filmstrip: true })
        expect(viewer!.snapshot().filmstrip).toBe(false)
    })

    it("setFilmstrip forces off and turns on only with 2+ items; notifies on change", () => {
        let ticks = 0
        viewer!.subscribe(() => {
            ticks += 1
        })
        viewer!.open({ items: [img("a"), img("b"), img("c")] })
        expect(viewer!.snapshot().filmstrip).toBe(true)
        ticks = 0
        viewer!.setFilmstrip(false)
        expect(viewer!.snapshot().filmstrip).toBe(false)
        expect(ticks).toBe(1)
        viewer!.setFilmstrip(false)
        expect(ticks).toBe(1)
        viewer!.setFilmstrip(true)
        expect(viewer!.snapshot().filmstrip).toBe(true)
        expect(ticks).toBe(2)

        viewer!.open({ items: [img("a")] })
        expect(viewer!.snapshot().filmstrip).toBe(false)
        ticks = 0
        viewer!.setFilmstrip(true)
        expect(viewer!.snapshot().filmstrip).toBe(false)
        viewer!.setFilmstrip(false)
        expect(viewer!.snapshot().filmstrip).toBe(false)
        expect(ticks).toBeGreaterThanOrEqual(1)
        viewer!.setItems([img("a"), img("b")])
        expect(viewer!.snapshot().filmstrip).toBe(false)
        ticks = 0
        viewer!.setFilmstrip(true)
        expect(viewer!.snapshot().filmstrip).toBe(true)
        expect(ticks).toBe(1)
    })

    it("filmstripMaxWidth defaults compact and can be set to full width", () => {
        viewer!.open({ items: [img("a"), img("b")] })
        expect(viewer!.snapshot().filmstripMaxWidth).toBe("36%")
        viewer!.open({ items: [img("a"), img("b")], filmstripMaxWidth: "100%" })
        expect(viewer!.snapshot().filmstripMaxWidth).toBe("100%")
        let ticks = 0
        viewer!.subscribe(() => {
            ticks += 1
        })
        viewer!.setFilmstripMaxWidth("24rem")
        expect(viewer!.snapshot().filmstripMaxWidth).toBe("24rem")
        expect(ticks).toBe(1)
        viewer!.setFilmstripMaxWidth("  24rem  ")
        expect(ticks).toBe(1)
        viewer!.setFilmstripMaxWidth("   ")
        expect(viewer!.snapshot().filmstripMaxWidth).toBe(MEDIA_FILMSTRIP_MAX_WIDTH_DEFAULT)
        expect(ticks).toBe(2)
    })
})
