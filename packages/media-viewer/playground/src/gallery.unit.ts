import { describe, expect, it } from "vitest"
import { DEFAULT_ALBUM_MAX_WIDTH } from "./album-layout"
import { albumMaxWidth } from "./gallery"

describe("albumMaxWidth", () => {
    it("uses the host width when positive", () => {
        expect(albumMaxWidth(1280)).toBe(1280)
        expect(albumMaxWidth(900.7)).toBe(900)
    })

    it("falls back to the default packer width when unmeasured", () => {
        expect(albumMaxWidth(0)).toBe(DEFAULT_ALBUM_MAX_WIDTH)
        expect(albumMaxWidth(-4)).toBe(DEFAULT_ALBUM_MAX_WIDTH)
    })
})
