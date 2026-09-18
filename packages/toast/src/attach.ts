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
    progressEl: HTMLElement | null
    progressAnim: Animation | null
    lastRemaining: number | undefined
    seenDuration: number | undefined
    progressStartedAt: number | undefined
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
    item.progressAnim?.cancel()
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

function clearStackItem(el: HTMLElement): void {
    el.removeAttribute("data-stack-depth")
    el.removeAttribute("aria-hidden")
    let close = el.querySelector("[data-yorozu-toast-close]")
    if (close instanceof HTMLElement) close.removeAttribute("tabindex")
}

function syncPermanent(el: HTMLElement, permanent: boolean): void {
    let close = el.querySelector("[data-yorozu-toast-close]")
    if (permanent) {
        el.setAttribute("data-permanent", "")
        if (close instanceof HTMLElement) {
            close.setAttribute("tabindex", "-1")
            close.setAttribute("aria-hidden", "true")
        }
        return
    }
    el.removeAttribute("data-permanent")
    if (!(close instanceof HTMLElement)) return
    close.removeAttribute("aria-hidden")
    let depth = el.getAttribute("data-stack-depth")
    if (depth != null && depth !== "0") close.setAttribute("tabindex", "-1")
    else close.removeAttribute("tabindex")
}

function syncSize<T>(el: HTMLElement, record: ToastRecord<T>): void {
    if (record.width != null) el.style.width = `${record.width}px`
    if (record.height != null) el.style.height = `${record.height}px`
}

function bindProgressHover(el: HTMLElement, getAnim: () => Animation | null): () => void {
    function onEnter(): void {
        getAnim()?.pause()
    }
    function onLeave(): void {
        getAnim()?.play()
    }
    el.addEventListener("pointerenter", onEnter)
    el.addEventListener("pointerleave", onLeave)
    return () => {
        el.removeEventListener("pointerenter", onEnter)
        el.removeEventListener("pointerleave", onLeave)
    }
}

function bindPainted<T>(
    el: HTMLElement,
    session: ToastSession<T>,
    id: string,
    getAnim: () => Animation | null,
): () => void {
    let unbindItem = bindToastItem(el, session, id)
    let unprogress = bindProgressHover(el, getAnim)
    return () => {
        unbindItem()
        unprogress()
    }
}

function syncProgress<T>(item: Painted, record: ToastRecord<T>, remainingMs: number): void {
    if (!record.progress) {
        item.progressAnim?.cancel()
        item.progressAnim = null
        item.progressEl?.remove()
        item.progressEl = null
        item.lastRemaining = undefined
        item.seenDuration = undefined
        item.progressStartedAt = undefined
        return
    }
    if (!item.progressEl) {
        let bar = document.createElement("div")
        bar.setAttribute("data-yorozu-toast-progress", "")
        bar.setAttribute("aria-hidden", "true")
        item.el.append(bar)
        item.progressEl = bar
    }
    if (record.exiting) {
        item.progressAnim?.cancel()
        item.progressAnim = null
        item.progressEl.style.transform = record.permanent ? "scaleX(1)" : "scaleX(0)"
        item.lastRemaining = 0
        item.seenDuration = record.duration
        item.progressStartedAt = undefined
        return
    }
    if (record.permanent) {
        item.progressAnim?.cancel()
        item.progressAnim = null
        item.progressEl.style.transform = "scaleX(1)"
        item.lastRemaining = 0
        item.seenDuration = record.duration
        item.progressStartedAt = undefined
        return
    }
    let rem = remainingMs
    let running = item.progressAnim != null
    let remainingDecreasedOrHeld = running && item.lastRemaining != null && rem <= item.lastRemaining
    let durationSame = item.seenDuration === record.duration
    let remainingResetToDuration =
        rem === record.duration && item.progressStartedAt != null && Date.now() > item.progressStartedAt
    if (remainingDecreasedOrHeld && durationSame && !remainingResetToDuration) {
        item.lastRemaining = rem
        return
    }
    item.progressAnim?.cancel()
    let ratio = record.duration > 0 ? rem / record.duration : 1
    item.progressEl.style.removeProperty("transform")
    let anim = item.progressEl.animate([{ transform: `scaleX(${ratio})` }, { transform: "scaleX(0)" }], {
        duration: rem,
        easing: "linear",
        fill: "forwards",
    })
    void anim.finished.catch(() => {})
    item.progressAnim = anim
    item.lastRemaining = rem
    item.seenDuration = record.duration
    item.progressStartedAt = Date.now()
    if (item.el.matches(":hover")) anim?.pause()
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

function makePainted<T extends ToastContent>(
    created: { el: HTMLElement; unmount: (() => void) | undefined },
    session: ToastSession<T>,
    record: ToastRecord<T>,
    lane: LaneKind,
    depth: number | undefined,
    closing: boolean,
): Painted {
    let painted: Painted
    painted = {
        el: created.el,
        unbind: bindPainted(created.el, session, record.id, () => painted.progressAnim),
        unmount: created.unmount,
        popover: createMenuPopover(),
        playback: null,
        closing,
        hiding: false,
        lane,
        depth,
        content: record.content,
        fade: null,
        fadeGen: 0,
        fadeMs: 0,
        progressEl: null,
        progressAnim: null,
        lastRemaining: undefined,
        seenDuration: undefined,
        progressStartedAt: undefined,
    }
    return painted
}

function swapContent<T extends ToastContent>(
    item: Painted,
    record: ToastRecord<T>,
    fadeMs: number,
    alive: () => boolean,
): void {
    if (Object.is(item.content, record.content)) return
    let contentEl = item.el.querySelector("[data-yorozu-toast-content]")
    if (!(contentEl instanceof HTMLElement)) return
    item.fadeGen += 1
    let gen = item.fadeGen
    let next = record.content
    item.content = next
    if (item.fade && item.fadeMs !== fadeMs) {
        item.fade.destroy()
        item.fade = null
    }
    if (!item.fade) {
        item.fade = createFade(contentEl, { durationMs: fadeMs })
        item.fadeMs = fadeMs
    }
    void item.fade.setVisible(false).done.then(() => {
        if (!alive() || !item.el.isConnected || item.fadeGen !== gen) return
        item.unmount?.()
        item.unmount = paintContent(contentEl, next as ToastContent)
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
    syncSize(el, record)
    if (record.exiting) el.classList.add("exiting")

    let contentEl = document.createElement("div")
    contentEl.setAttribute("data-yorozu-toast-content", "")
    let unmount = paintContent(contentEl, record.content as ToastContent)
    el.append(contentEl)

    let close = document.createElement("button")
    close.type = "button"
    close.setAttribute("data-yorozu-toast-close", "")
    close.setAttribute("aria-label", "Close")
    close.textContent = "×"
    el.append(close)
    syncPermanent(el, record.permanent)
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
                if (existing.lane === "stack") {
                    stack.forget(existing.el)
                    clearStackItem(existing.el)
                }
                existing.lane = "permanent"
                existing.depth = undefined
                existing.hiding = false
                existing.el.classList.toggle("exiting", record.exiting)
                placeChild(permanentLane, existing.el, index)
                syncPermanent(existing.el, record.permanent)
                syncSize(existing.el, record)
                swapContent(existing, record, motionMs(opts, FADE_MS), () => alive)
                syncProgress(existing, record, session.remaining(record.id))
                if (record.exiting && !existing.closing) {
                    existing.closing = true
                    existing.playback?.cancel()
                    existing.playback = existing.popover.playClose(existing.el, { origin, durationMs: closeMs })
                }
                continue
            }
            let created = createToastEl(record)
            let painted = makePainted(created, session, record, "permanent", undefined, record.exiting)
            items.set(record.id, painted)
            placeChild(permanentLane, created.el, index)
            painted.playback = record.exiting
                ? painted.popover.playClose(created.el, { origin, durationMs: closeMs })
                : painted.popover.playOpen(created.el, { origin, durationMs: openMs })
            syncProgress(painted, record, session.remaining(record.id))
        }

        for (let index = 0; index < visible.length; index++) {
            let record = visible[index]!
            let depth = visible.length - 1 - index
            let existing = items.get(record.id)
            if (record.exiting && depth > 0) {
                if (!existing) {
                    let created = createToastEl(record)
                    syncStackItem(created.el, depth)
                    existing = makePainted(created, session, record, "stack", depth, true)
                    items.set(record.id, existing)
                    placeChild(stackLane, created.el, index)
                }
                existing.el.classList.add("exiting")
                syncProgress(existing, record, session.remaining(record.id))
                continue
            }
            seen.add(record.id)
            if (existing) {
                let firstStackInsert = existing.lane === "permanent" || existing.depth == null
                existing.hiding = false
                existing.lane = "stack"
                existing.el.classList.toggle("exiting", record.exiting)
                syncStackItem(existing.el, depth)
                placeChild(stackLane, existing.el, index)
                syncPermanent(existing.el, record.permanent)
                syncSize(existing.el, record)
                swapContent(existing, record, motionMs(opts, FADE_MS), () => alive)
                syncProgress(existing, record, session.remaining(record.id))
                if (record.exiting && !existing.closing) {
                    existing.closing = true
                    existing.playback?.cancel()
                    if (existing.depth !== 0) stack.set(existing.el, 0, { axis, durationMs: 0 })
                    existing.playback = existing.popover.playClose(existing.el, { origin, durationMs: closeMs })
                    existing.depth = 0
                } else if (!record.exiting && existing.depth !== depth) {
                    restack(existing, depth, axis, firstStackInsert ? 0 : layerMs)
                }
                continue
            }
            let created = createToastEl(record)
            syncStackItem(created.el, depth)
            let painted = makePainted(created, session, record, "stack", depth, record.exiting)
            items.set(record.id, painted)
            placeChild(stackLane, created.el, index)
            if (record.exiting) {
                painted.playback = painted.popover.playClose(created.el, { origin, durationMs: closeMs })
            } else if (depth === 0) {
                painted.playback = painted.popover.playOpen(created.el, { origin, durationMs: openMs })
                stack.set(created.el, 0, { axis, durationMs: 0 })
            } else {
                stack.set(created.el, depth, { axis, durationMs: layerMs })
            }
            syncProgress(painted, record, session.remaining(record.id))
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
