import { describe, expect, it } from "vitest"
import { DEFAULT_ALBUM_MAX_WIDTH } from "./album-layout"
import { albumPackWidth } from "./gallery"

describe("albumPackWidth", () => {
    it("returns DEFAULT_ALBUM_MAX_WIDTH (450), not a host width like 1280", () => {
        let fakeAvailableWidth = 1280
        expect(albumPackWidth()).toBe(DEFAULT_ALBUM_MAX_WIDTH)
        expect(albumPackWidth()).toBe(450)
        expect(albumPackWidth()).not.toBe(fakeAvailableWidth)
    })
})
