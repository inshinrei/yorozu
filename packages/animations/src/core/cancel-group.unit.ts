import { describe, expect, it, vi } from "vitest"
import { createPlayback } from "./playback"
import { createCancelGroup } from "./cancel-group"

describe("createCancelGroup", () => {
    it("take cancels the previous occupant of a slot", async () => {
        let group = createCancelGroup()
        let first = createPlayback()
        let second = createPlayback()
        group.take("inbox-layer", first.playback)
        expect(group.get("inbox-layer")).toBe(first.playback)
        group.take("inbox-layer", second.playback)
        expect(await first.playback.done).toBe(false)
        expect(group.get("inbox-layer")).toBe(second.playback)
        group.cancel("inbox-layer")
        expect(await second.playback.done).toBe(false)
        expect(group.get("inbox-layer")).toBeUndefined()
    })

    it("cancelAll cancels every slot and misses are no-ops", async () => {
        let group = createCancelGroup()
        let a = createPlayback()
        let b = createPlayback()
        group.take("dock", a.playback)
        group.take("folder-tab", b.playback)
        group.cancel("missing")
        group.cancelAll()
        expect(await a.playback.done).toBe(false)
        expect(await b.playback.done).toBe(false)
        expect(group.get("dock")).toBeUndefined()
    })

    it("taking the same playback twice does not cancel it", async () => {
        let group = createCancelGroup()
        let { playback, resolve } = createPlayback()
        let cancel = vi.fn(playback.cancel)
        playback.cancel = cancel
        group.take("list-reorder", playback)
        group.take("list-reorder", playback)
        expect(cancel).not.toHaveBeenCalled()
        resolve(true)
        expect(await playback.done).toBe(true)
    })
})
