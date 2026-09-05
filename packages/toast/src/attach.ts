import { bindToastItem } from "./bind"
import type { ToastContent, ToastSession } from "./session"

type Painted = {
    el: HTMLElement
    unbind: () => void
    unmount: (() => void) | undefined
}

export function attachToastRoot<T extends ToastContent>(session: ToastSession<T>, root: HTMLElement): () => void {
    root.setAttribute("data-yorozu-toast-root", "")
    let items = new Map<string, Painted>()

    function paint(): void {
        let records = session.toasts()
        let seen = new Set<string>()
        for (let record of records) {
            seen.add(record.id)
            let existing = items.get(record.id)
            if (existing) {
                existing.el.classList.toggle("exiting", record.exiting)
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
            items.set(record.id, { el, unbind, unmount })
            root.append(el)
        }
        for (let [id, item] of [...items]) {
            if (seen.has(id)) continue
            item.unbind()
            item.unmount?.()
            item.el.remove()
            items.delete(id)
        }
    }

    let unsub = session.subscribe(paint)
    paint()
    return () => {
        unsub()
        for (let item of items.values()) {
            item.unbind()
            item.unmount?.()
            item.el.remove()
        }
        items.clear()
    }
}
