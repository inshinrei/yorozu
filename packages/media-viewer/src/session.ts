import type {
    MediaViewer,
    MediaViewerChromeSlots,
    MediaViewerItem,
    MediaViewerNavFrom,
    MediaViewerNeighbor,
    MediaViewerOpenOpts,
    MediaViewerOrigin,
    MediaViewerSessionOpts,
    MediaViewerSnapshot,
} from "./types"

export type {
    MediaKind,
    MediaViewer,
    MediaViewerChrome,
    MediaViewerChromeApi,
    MediaViewerChromeSlots,
    MediaViewerItem,
    MediaViewerNavFrom,
    MediaViewerNeighbor,
    MediaViewerOpenOpts,
    MediaViewerOrigin,
    MediaViewerSessionOpts,
    MediaViewerSnapshot,
} from "./types"

function clampIndex(index: number, length: number): number {
    if (length <= 0) return 0
    if (index < 0) return 0
    if (index > length - 1) return length - 1
    return index
}

function toNeighbor(item: MediaViewerItem | undefined): MediaViewerNeighbor | null {
    if (item == null) return null
    return { id: item.id, kind: item.kind, src: item.src ?? null }
}

export function createMediaViewer(opts?: MediaViewerSessionOpts): MediaViewer {
    let alive = true
    let openFlag = false
    let items: MediaViewerItem[] = []
    let index = 0
    let origin: MediaViewerOrigin | null = null
    let openGhost = false
    let closeGhostOverride: boolean | undefined
    let explicitNeighbors: { older: MediaViewerNeighbor | null; newer: MediaViewerNeighbor | null } | null = null
    let olderFlag = false
    let newerFlag = false
    let chromeSlots: MediaViewerChromeSlots | null = null
    let navFrom: MediaViewerNavFrom | null = null
    let listeners = new Set<() => void>()

    function notify(): void {
        for (let listener of listeners) listener()
    }

    function reducedMotion(): boolean {
        return opts?.prefersReducedMotion?.() === true
    }

    function currentItem(): MediaViewerItem | null {
        if (items.length === 0) return null
        return items[index] ?? null
    }

    function resolveNeighbors(): { older: MediaViewerNeighbor | null; newer: MediaViewerNeighbor | null } {
        if (explicitNeighbors != null) {
            return { older: explicitNeighbors.older, newer: explicitNeighbors.newer }
        }
        return {
            older: toNeighbor(items[index - 1]),
            newer: toNeighbor(items[index + 1]),
        }
    }

    function snapshot(): MediaViewerSnapshot {
        return {
            open: openFlag,
            items: items.slice(),
            index,
            current: currentItem(),
            neighbors: resolveNeighbors(),
            canOlder: index > 0 || olderFlag,
            canNewer: index < items.length - 1 || newerFlag,
            origin,
            ghost: openGhost,
        }
    }

    function wantsGhost(kind: "open" | "close"): boolean {
        if (reducedMotion()) return false
        if (kind === "open") return openGhost
        if (origin == null) return false
        if (closeGhostOverride !== undefined) return closeGhostOverride
        return openGhost
    }

    function open(openOpts: MediaViewerOpenOpts): void {
        if (!alive) return
        items = openOpts.items.slice()
        index = clampIndex(openOpts.index ?? 0, items.length)
        origin = openOpts.origin ?? null
        openGhost = openOpts.ghost === false ? false : origin != null
        closeGhostOverride = undefined
        explicitNeighbors = openOpts.neighbors ?? null
        olderFlag = openOpts.canOlder === true
        newerFlag = openOpts.canNewer === true
        chromeSlots = openOpts.chrome ?? null
        navFrom = null
        openFlag = true
        notify()
    }

    function beginClose(closeOpts?: { ghost?: boolean }): boolean {
        if (!alive || !openFlag) return false
        if (closeOpts != null && closeOpts.ghost !== undefined) {
            closeGhostOverride = closeOpts.ghost
        } else {
            closeGhostOverride = undefined
        }
        notify()
        return wantsGhost("close")
    }

    function finishClose(): void {
        if (!alive || !openFlag) return
        openFlag = false
        navFrom = null
        notify()
        opts?.onClose?.()
    }

    function close(): void {
        finishClose()
    }

    function forceClose(): void {
        if (!alive || !openFlag) return
        closeGhostOverride = false
        finishClose()
    }

    function setItems(nextItems: readonly MediaViewerItem[], nextIndex?: number): void {
        if (!alive) return
        let prevId = currentItem()?.id
        items = nextItems.slice()
        if (nextIndex !== undefined) {
            index = clampIndex(nextIndex, items.length)
        } else if (prevId != null) {
            let found = items.findIndex((item) => item.id === prevId)
            index = found >= 0 ? found : clampIndex(index, items.length)
        } else {
            index = clampIndex(index, items.length)
        }
        notify()
    }

    function setNeighbors(neighbors: { older: MediaViewerNeighbor | null; newer: MediaViewerNeighbor | null }): void {
        if (!alive) return
        explicitNeighbors = { older: neighbors.older, newer: neighbors.newer }
        notify()
    }

    function setCanNav(can: { older?: boolean; newer?: boolean }): void {
        if (!alive) return
        if (can.older !== undefined) olderFlag = can.older
        if (can.newer !== undefined) newerFlag = can.newer
        notify()
    }

    function prev(from: MediaViewerNavFrom = "key"): void {
        if (!alive || !openFlag) return
        if (index > 0) {
            index -= 1
            navFrom = from
            notify()
            let item = currentItem()
            if (item != null) opts?.onIndexChange?.(index, item)
            return
        }
        if (olderFlag) {
            navFrom = from
            opts?.onRequestOlder?.()
            return
        }
    }

    function next(from: MediaViewerNavFrom = "key"): void {
        if (!alive || !openFlag) return
        if (index < items.length - 1) {
            index += 1
            navFrom = from
            notify()
            let item = currentItem()
            if (item != null) opts?.onIndexChange?.(index, item)
            return
        }
        if (newerFlag) {
            navFrom = from
            opts?.onRequestNewer?.()
            return
        }
    }

    function goTo(target: number): void {
        if (!alive || !openFlag) return
        let nextIdx = clampIndex(target, items.length)
        if (nextIdx === index) return
        index = nextIdx
        navFrom = "jump"
        notify()
        let item = currentItem()
        if (item != null) opts?.onIndexChange?.(index, item)
    }

    function chrome(): MediaViewerChromeSlots | null {
        return chromeSlots
    }

    function lastNav(): MediaViewerNavFrom | null {
        return navFrom
    }

    function subscribe(listener: () => void): () => void {
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
        }
    }

    function destroy(): void {
        if (!alive) return
        alive = false
        openFlag = false
        navFrom = null
        notify()
        listeners.clear()
    }

    return {
        open,
        beginClose,
        close,
        forceClose,
        setItems,
        setNeighbors,
        setCanNav,
        prev,
        next,
        goTo,
        chrome,
        lastNav,
        wantsGhost,
        subscribe,
        snapshot,
        destroy,
    }
}
