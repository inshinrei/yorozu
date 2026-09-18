import { createFade, createStackLayer, FADE_MS, STACK_LAYER_MS, type Fade, type StackAxis } from "@yorozu/animations"
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
    content: unknown
    fade: Fade | null
    fadeGen: number
    fadeMs: number
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
    item.fade?.destroy()
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

function syncStackItem(el: HTMLElement, depth: number): void {
    el.setAttribute("data-stack-depth", String(depth))
    let close = el.querySelector("[data-yorozu-toast-close]")
    if (close instanceof HTMLElement) {
        if (depth === 0) close.removeAttribute("tabindex")
        else close.setAttribute("tabindex", "-1")
    }
    if (depth === 0) el.removeAttribute("aria-hidden")
    else el.setAttribute("aria-hidden", "true")
}

function syncPermanent(el: HTMLElement, permanent: boolean): void {
    if (permanent) el.setAttribute("data-permanent", "")
    else el.removeAttribute("data-permanent")
}

function syncSize<T>(el: HTMLElement, record: ToastRecord<T>): void {
    if (record.width != null) el.style.width = `${record.width}px`
    if (record.height != null) el.style.height = `${record.height}px`
}

function paintContent(contentEl: HTMLElement, content: ToastContent): (() => void) | undefined {
    contentEl.replaceChildren()
    if (typeof content === "string") {
        contentEl.textContent = content
        return undefined
    }
    let cleanup = content(contentEl)
    return typeof cleanup === "function" ? cleanup : undefined
}

function swapContent<T extends ToastContent>(
    item: Painted,
    record: ToastRecord<T>,
    fadeMs: number,
    alive: () => boolean,
): void {
    if (Object.is(item.content, record.content)) return
    item.fadeGen += 1
    let gen = item.fadeGen
    let contentEl = item.el.querySelector("[data-yorozu-toast-content]")
    if (!(contentEl instanceof HTMLElement)) return
    if (item.fade && item.fadeMs !== fadeMs) {
        item.fade.destroy()
        item.fade = null
    }
    if (!item.fade) {
        item.fade = createFade(contentEl, { durationMs: fadeMs })
        item.fadeMs = fadeMs
    }
    void item.fade.setVisible(false).done.then((ran) => {
        if (!alive() || item.fadeGen !== gen) return
        item.unmount?.()
        item.unmount = paintContent(contentEl, record.content as ToastContent)
        item.content = record.content
        if (!ran && fadeMs > 0 && item.fadeGen !== gen) return
        item.fade?.setVisible(true)
    })
}

function createToastEl<T extends ToastContent>(
    record: ToastRecord<T>,
): {
    el: HTMLElement
    unmount: (() => void) | undefined
} {
    let el = document.createElement("div")
    el.setAttribute("data-yorozu-toast", "")
    syncPermanent(el, record.permanent)
    syncSize(el, record)
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

    let close = document.createElement("button")
    close.type = "button"
    close.setAttribute("data-yorozu-toast-close", "")
    close.setAttribute("aria-label", "Close")
    close.textContent = "×"
    el.append(close)
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

    function dropHidden(id: string, item: Painted): void {
        if (!alive) return
        if (items.get(id) !== item) return
        if (!item.hiding) return
        let current = session.toasts()
        if (current.some((record) => record.id === id)) {
            if (timedVisible(current).some((record) => record.id === id)) return
        }
        forgetStacked(item)
        dropItem(item)
        items.delete(id)
    }

    function hideStacked(id: string, item: Painted, axis: StackAxis, layerMs: number): void {
        let hideDepth = TOAST_STACK_MAX_BEHIND + 1
        syncStackItem(item.el, hideDepth)
        item.depth = hideDepth
        if (item.hiding) return
        item.hiding = true
        item.playback?.cancel()
        item.playback = null
        let playback = stack.set(item.el, hideDepth, { axis, durationMs: layerMs })
        void playback.done.then(() => dropHidden(id, item))
    }

    function restack(item: Painted, depth: number, axis: StackAxis, durationMs: number): void {
        item.playback?.cancel()
        item.playback = null
        item.depth = depth
        syncStackItem(item.el, depth)
        stack.set(item.el, depth, { axis, durationMs })
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
                syncPermanent(existing.el, record.permanent)
                syncSize(existing.el, record)
                swapContent(existing, record, motionMs(opts, FADE_MS), () => alive)
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
                content: record.content,
                fade: null,
                fadeGen: 0,
                fadeMs: 0,
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
            let existing = items.get(record.id)
            if (record.exiting && depth > 0) {
                if (!existing) {
                    let created = createToastEl(record)
                    syncStackItem(created.el, depth)
                    let popover = createMenuPopover()
                    existing = {
                        el: created.el,
                        unbind: bindToastItem(created.el, session, record.id),
                        unmount: created.unmount,
                        popover,
                        playback: null,
                        closing: true,
                        hiding: false,
                        lane: "stack",
                        depth,
                        content: record.content,
                        fade: null,
                        fadeGen: 0,
                        fadeMs: 0,
                    }
                    items.set(record.id, existing)
                    placeChild(stackLane, created.el, index)
                }
                existing.el.classList.add("exiting")
                continue
            }
            seen.add(record.id)
            if (existing) {
                existing.hiding = false
                existing.lane = "stack"
                existing.el.classList.toggle("exiting", record.exiting)
                syncStackItem(existing.el, depth)
                placeChild(stackLane, existing.el, index)
                syncPermanent(existing.el, record.permanent)
                syncSize(existing.el, record)
                swapContent(existing, record, motionMs(opts, FADE_MS), () => alive)
                if (record.exiting && !existing.closing) {
                    existing.closing = true
                    existing.playback?.cancel()
                    if (existing.depth !== 0) stack.set(existing.el, 0, { axis, durationMs: 0 })
                    existing.playback = existing.popover.playClose(existing.el, { origin, durationMs: closeMs })
                    existing.depth = 0
                } else if (!record.exiting && existing.depth !== depth) {
                    restack(existing, depth, axis, layerMs)
                }
                continue
            }
            let created = createToastEl(record)
            syncStackItem(created.el, depth)
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
                content: record.content,
                fade: null,
                fadeGen: 0,
                fadeMs: 0,
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

        for (let [id, item] of [...items]) {
            if (seen.has(id)) continue
            let stillInSession = records.some((record) => record.id === id)
            if (!stillInSession) {
                forgetStacked(item)
                dropItem(item)
                items.delete(id)
                continue
            }
            hideStacked(id, item, axis, layerMs)
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
