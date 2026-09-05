import { createMenuPopover } from "@yorozu/context-menu"
import { bindToastItem } from "./bind"
import type { ToastContent, ToastPlacement, ToastSession } from "./session"

type MenuPopover = ReturnType<typeof createMenuPopover>
type Painted = {
    el: HTMLElement
    unbind: () => void
    unmount: (() => void) | undefined
    popover: MenuPopover
    playback: ReturnType<MenuPopover["playOpen"]> | null
    closing: boolean
}

function popoverOrigin(placement: ToastPlacement): string {
    return placement.startsWith("top") ? "center top" : "center bottom"
}

function dropItem(item: Painted): void {
    item.playback?.cancel()
    item.unbind()
    item.unmount?.()
    item.el.remove()
}

export function attachToastRoot<T extends ToastContent>(session: ToastSession<T>, root: HTMLElement): () => void {
    root.setAttribute("data-yorozu-toast-root", "")
    let items = new Map<string, Painted>()

    function paint(): void {
        let placement = session.placement()
        root.setAttribute("data-placement", placement)
        let origin = popoverOrigin(placement)
        let records = session.toasts()
        let seen = new Set<string>()
        for (let record of records) {
            seen.add(record.id)
            let existing = items.get(record.id)
            if (existing) {
                existing.el.classList.toggle("exiting", record.exiting)
                if (record.exiting && !existing.closing) {
                    existing.closing = true
                    existing.playback?.cancel()
                    existing.playback = existing.popover.playClose(existing.el, { origin })
                }
                continue
            }
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

            let unbind = bindToastItem(el, session, record.id)
            let popover = createMenuPopover()
            let painted: Painted = {
                el,
                unbind,
                unmount,
                popover,
                playback: null,
                closing: record.exiting,
            }
            items.set(record.id, painted)
            root.append(el)
            painted.playback = record.exiting ? popover.playClose(el, { origin }) : popover.playOpen(el, { origin })
        }
        for (let [id, item] of [...items]) {
            if (seen.has(id)) continue
            dropItem(item)
            items.delete(id)
        }
    }

    let unsub = session.subscribe(paint)
    paint()
    return () => {
        unsub()
        for (let item of items.values()) dropItem(item)
        items.clear()
    }
}
