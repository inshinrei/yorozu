import { describe, expect, it } from "vitest"
import { DEFAULT_ALBUM_MAX_WIDTH } from "./album-layout"
import { albumHostCssText, albumPackWidth, toGalleryViewerItem } from "./gallery"

describe("albumPackWidth", () => {
    it("returns DEFAULT_ALBUM_MAX_WIDTH (450), not a host width like 1280", () => {
        let fakeAvailableWidth = 1280
        expect(albumPackWidth()).toBe(DEFAULT_ALBUM_MAX_WIDTH)
        expect(albumPackWidth()).toBe(450)
        expect(albumPackWidth()).not.toBe(fakeAvailableWidth)
    })
})

describe("albumHostCssText", () => {
    it("sizes the host to packed pixels with max-width 100%", () => {
        expect(albumHostCssText({ width: 450, height: 224 })).toBe("width:450px;max-width:100%;aspect-ratio:450 / 224")
        expect(albumHostCssText({ width: 450, height: 224 }).split(";")).not.toContain("width:100%")
    })

    it("returns empty when packed size is not positive", () => {
        expect(albumHostCssText({ width: 0, height: 224 })).toBe("")
        expect(albumHostCssText({ width: 450, height: 0 })).toBe("")
    })
})

describe("toGalleryViewerItem", () => {
    it("omits poster for video even when the manifest entry has one", () => {
        let item = toGalleryViewerItem(
            {
                id: "vid-001",
                src: "/media/vid-001.mp4",
                poster: "/media/img-001.jpg",
                width: 720,
                height: 1280,
            },
            "video",
        )
        expect(item).toEqual({
            id: "vid-001",
            kind: "video",
            src: "/media/vid-001.mp4",
            naturalWidth: 720,
            naturalHeight: 1280,
        })
        expect(item).not.toHaveProperty("poster")
    })

    it("maps image entries without inventing a poster", () => {
        let item = toGalleryViewerItem({ id: "img-001", src: "/media/img-001.jpg", width: 100, height: 200 }, "image")
        expect(item).toEqual({
            id: "img-001",
            kind: "image",
            src: "/media/img-001.jpg",
            naturalWidth: 100,
            naturalHeight: 200,
        })
    })
})
