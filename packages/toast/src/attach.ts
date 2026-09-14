import { createStackLayer, STACK_LAYER_MS, type StackAxis } from "@yorozu/animations"
import { createMenuPopover } from "@yorozu/context-menu"
import { bindToastItem } from "./bind"
import {
    TOAST_ENTER_MS,
    TOAST_EXIT_MS,
    TOAST_STACK_MAX_BEHIND,
    type ToastContent,
    type ToastPlacement,
    type ToastRecord,
    type ToastSession,
} from "./session"

export type AttachToastRootOpts = {
    prefersReducedMotion?: () => boolean
}

type MenuPopover = ReturnType<typeof createMenuPopover>
type LaneKind = "permanent" | "stack"
type Painted = {
    el: HTMLElement
    unbind: () => void
    unmount: (() => void) | undefined
    popover: MenuPopover
    playback: ReturnType<MenuPopover["playOpen"]> | null
    closing: boolean
    hiding: boolean
    lane: LaneKind
    depth: number | undefined
}

function popoverOrigin(placement: ToastPlacement): string {
    return placement.startsWith("top") ? "center top" : "center bottom"
}

function stackAxis(placement: ToastPlacement): StackAxis {
    return placement.startsWith("top") ? "down" : "up"
}

function motionMs(opts: AttachToastRootOpts | undefined, fallback: number): number {
    return opts?.prefersReducedMotion?.() ? 0 : fallback
}

function dropItem(item: Painted): void {
    item.playback?.cancel()
    item.unbind()
    item.unmount?.()
    item.el.remove()
}

function makeLane(kind: LaneKind): HTMLElement {
    let lane = document.createElement("div")
    lane.setAttribute("data-yorozu-toast-lane", kind)
    return lane
}

function placeChild(parent: HTMLElement, child: HTMLElement, index: number): void {
    let current = parent.children[index]
    if (current === child) return
    parent.insertBefore(child, current ?? null)
}

function createToastEl<T extends ToastContent>(
    record: ToastRecord<T>,
): {
    el: HTMLElement
    unmount: (() => void) | undefined
} {
    let el = document.createElement("div")
    el.setAttribute("data-yorozu-toast", "")
    if (record.permanent) el.setAttribute("data-permanent", "")
    if (record.exiting) el.classList.add("exiting")

    let contentEl = document.createElement("div")
    contentEl.setAttribute("data-yorozu-toast-content", "")
    let unmount: (() => void) | undefined
    let content = record.content as ToastContent
    if (typeof content === "string") {
        contentEl.textContent = content
    } else {
        let cleanup = content(contentEl)
        if (typeof cleanup === "function") unmount = cleanup
    }
    el.append(contentEl)

    if (!record.permanent) {
        let close = document.createElement("button")
        close.type = "button"
        close.setAttribute("data-yorozu-toast-close", "")
        close.setAttribute("aria-label", "Close")
        close.textContent = "×"
        el.append(close)
    }
    return { el, unmount }
}

function timedVisible<T>(records: readonly ToastRecord<T>[]): ToastRecord<T>[] {
    let timed = records.filter((record) => !record.permanent)
    return timed.slice(-(TOAST_STACK_MAX_BEHIND + 1))
}

export function attachToastRoot<T extends ToastContent>(
    session: ToastSession<T>,
    root: HTMLElement,
    opts?: AttachToastRootOpts,
): () => void {
    root.setAttribute("data-yorozu-toast-root", "")
    let items = new Map<string, Painted>()
    let stack = createStackLayer()
    let alive = true
    let permanentLane = makeLane("permanent")
    let stackLane = makeLane("stack")
    root.append(permanentLane, stackLane)

    function forgetStacked(item: Painted): void {
        if (item.lane === "stack") stack.forget(item.el)
    }

    function paint(): void {
        if (!alive) return
        let placement = session.placement()
        root.setAttribute("data-placement", placement)
        let origin = popoverOrigin(placement)
        let axis = stackAxis(placement)
        let layerMs = motionMs(opts, STACK_LAYER_MS)
        let openMs = motionMs(opts, TOAST_ENTER_MS)
        let closeMs = motionMs(opts, TOAST_EXIT_MS)
        let records = session.toasts()
        let permanents = records.filter((record) => record.permanent)
        let visible = timedVisible(records)
        let seen = new Set<string>()

        for (let index = 0; index < permanents.length; index++) {
            let record = permanents[index]!
            seen.add(record.id)
            let existing = items.get(record.id)
            if (existing) {
                existing.el.classList.toggle("exiting", record.exiting)
                placeChild(permanentLane, existing.el, index)
                if (record.exiting && !existing.closing) {
                    existing.closing = true
                    existing.playback?.cancel()
                    existing.playback = existing.popover.playClose(existing.el, { origin, durationMs: closeMs })
                }
                continue
            }
            let created = createToastEl(record)
            let popover = createMenuPopover()
            let painted: Painted = {
                el: created.el,
                unbind: bindToastItem(created.el, session, record.id),
                unmount: created.unmount,
                popover,
                playback: null,
                closing: record.exiting,
                hiding: false,
                lane: "permanent",
                depth: undefined,
            }
            items.set(record.id, painted)
            placeChild(permanentLane, created.el, index)
            painted.playback = record.exiting
                ? popover.playClose(created.el, { origin, durationMs: closeMs })
                : popover.playOpen(created.el, { origin, durationMs: openMs })
        }

        for (let index = 0; index < visible.length; index++) {
            let record = visible[index]!
            let depth = visible.length - 1 - index
            seen.add(record.id)
            let existing = items.get(record.id)
            if (existing) {
                existing.hiding = false
                existing.lane = "stack"
                existing.el.classList.toggle("exiting", record.exiting)
                existing.el.setAttribute("data-stack-depth", String(depth))
                placeChild(stackLane, existing.el, index)
                if (record.exiting && !existing.closing) {
                    existing.closing = true
                    existing.playback?.cancel()
                    existing.playback = existing.popover.playClose(existing.el, { origin, durationMs: closeMs })
                    existing.depth = depth
                } else if (!record.exiting && existing.depth !== depth) {
                    existing.depth = depth
                    stack.set(existing.el, depth, { axis, durationMs: layerMs })
                }
                continue
            }
            let created = createToastEl(record)
            created.el.setAttribute("data-stack-depth", String(depth))
            let popover = createMenuPopover()
            let painted: Painted = {
                el: created.el,
                unbind: bindToastItem(created.el, session, record.id),
                unmount: created.unmount,
                popover,
                playback: null,
                closing: record.exiting,
                hiding: false,
                lane: "stack",
                depth,
            }
            items.set(record.id, painted)
            placeChild(stackLane, created.el, index)
            if (record.exiting) {
                painted.playback = popover.playClose(created.el, { origin, durationMs: closeMs })
            } else if (depth === 0) {
                painted.playback = popover.playOpen(created.el, { origin, durationMs: openMs })
                stack.set(created.el, 0, { axis, durationMs: 0 })
            } else {
                stack.set(created.el, depth, { axis, durationMs: layerMs })
            }
        }

        let hideSlot = 0
        let hideDepth = TOAST_STACK_MAX_BEHIND + 1
        for (let [id, item] of [...items]) {
            if (seen.has(id)) continue
            let stillInSession = records.some((record) => record.id === id)
            if (!stillInSession) {
                forgetStacked(item)
                dropItem(item)
                items.delete(id)
                continue
            }
            item.el.setAttribute("data-stack-depth", String(hideDepth))
            item.depth = hideDepth
            placeChild(stackLane, item.el, hideSlot)
            hideSlot += 1
            if (item.hiding) continue
            item.hiding = true
            let playback = stack.set(item.el, hideDepth, { axis, durationMs: layerMs })
            void playback.done.then(() => {
                if (!alive) return
                if (items.get(id) !== item) return
                if (!item.hiding) return
                let stillVisible = timedVisible(session.toasts()).some((record) => record.id === id)
                if (stillVisible) return
                forgetStacked(item)
                dropItem(item)
                items.delete(id)
            })
        }
    }

    let unsub = session.subscribe(paint)
    paint()
    return () => {
        alive = false
        unsub()
        stack.destroy()
        for (let item of items.values()) dropItem(item)
        items.clear()
        permanentLane.remove()
        stackLane.remove()
    }
}
