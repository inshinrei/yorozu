// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { captureOriginFromDom, MEDIA_ORIGIN_ATTR, mediaOriginSelector, queryMediaOriginEl } from "./origin"

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

describe("media origin", () => {
    afterEach(() => {
        document.body.replaceChildren()
        vi.restoreAllMocks()
    })

    it("escapes quotes in the origin selector", () => {
        expect(mediaOriginSelector('a"b')).toBe(`[${MEDIA_ORIGIN_ATTR}="a\\"b"]`)
        expect(MEDIA_ORIGIN_ATTR).toBe("data-media-origin")
    })

    it("queries the stamped origin element", () => {
        let el = document.createElement("div")
        el.setAttribute(MEDIA_ORIGIN_ATTR, 'a"b')
        document.body.append(el)
        expect(queryMediaOriginEl('a"b')).toBe(el)
        expect(queryMediaOriginEl("missing")).toBeNull()

        let root = document.createElement("div")
        let nested = document.createElement("span")
        nested.setAttribute(MEDIA_ORIGIN_ATTR, "nested")
        root.append(nested)
        expect(queryMediaOriginEl("nested", root)).toBe(nested)
        expect(queryMediaOriginEl("nested")).toBeNull()
    })

    it("captures origin from an img", () => {
        let img = document.createElement("img")
        img.setAttribute(MEDIA_ORIGIN_ATTR, "photo")
        img.src = "https://cdn.example/photo.jpg"
        img.style.objectFit = "contain"
        vi.spyOn(img, "getBoundingClientRect").mockReturnValue(fakeRect(20, 10, 40, 30))
        document.body.append(img)

        expect(captureOriginFromDom("photo", { naturalWidth: 800, naturalHeight: 600 })).toEqual({
            id: "photo",
            rect: { top: 10, left: 20, width: 40, height: 30 },
            imageUrl: img.currentSrc || img.src,
            objectFit: "contain",
            naturalWidth: 800,
            naturalHeight: 600,
        })
    })

    it("returns null for a missing or zero-size origin", () => {
        expect(captureOriginFromDom("none")).toBeNull()
        let img = document.createElement("img")
        img.setAttribute(MEDIA_ORIGIN_ATTR, "empty")
        img.src = "https://cdn.example/empty.jpg"
        vi.spyOn(img, "getBoundingClientRect").mockReturnValue(fakeRect(0, 0, 0, 10))
        document.body.append(img)
        expect(captureOriginFromDom("empty")).toBeNull()
    })

    it("reads a video poster and honors a custom attr", () => {
        let video = document.createElement("video")
        video.setAttribute("data-gallery-origin", "clip")
        video.poster = "https://cdn.example/poster.jpg"
        video.style.objectFit = "cover"
        vi.spyOn(video, "getBoundingClientRect").mockReturnValue(fakeRect(1, 2, 8, 9))
        document.body.append(video)
        expect(captureOriginFromDom("clip", { attr: "data-gallery-origin" })).toEqual({
            id: "clip",
            rect: { top: 2, left: 1, width: 8, height: 9 },
            imageUrl: "https://cdn.example/poster.jpg",
            objectFit: "cover",
        })
    })
})
