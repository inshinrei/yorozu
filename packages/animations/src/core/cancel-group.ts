import type { Playback } from "./types"

export type CancelGroup = {
    take(slot: string, playback: Playback): void
    cancel(slot: string): void
    cancelAll(): void
    get(slot: string): Playback | undefined
}

export function createCancelGroup(): CancelGroup {
    let slots = new Map<string, Playback>()

    let take = (slot: string, playback: Playback): void => {
        let prev = slots.get(slot)
        if (prev && prev !== playback) {
            prev.cancel()
        }
        slots.set(slot, playback)
    }

    let cancel = (slot: string): void => {
        let prev = slots.get(slot)
        if (!prev) return
        prev.cancel()
        slots.delete(slot)
    }

    let cancelAll = (): void => {
        for (let playback of slots.values()) {
            playback.cancel()
        }
        slots.clear()
    }

    let get = (slot: string): Playback | undefined => slots.get(slot)

    return { take, cancel, cancelAll, get }
}
