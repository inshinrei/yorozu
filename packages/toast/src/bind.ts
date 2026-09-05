import type { ToastSession } from "./session"

export function bindToastItem<T>(
    el: HTMLElement,
    session: ToastSession<T>,
    id: string,
    opts?: { closeSelector?: string },
): () => void {
    let closeSelector = opts?.closeSelector ?? "[data-yorozu-toast-close]"

    function onEnter(): void {
        session.pause(id)
    }

    function onLeave(): void {
        session.resume(id)
    }

    function onClick(event: Event): void {
        let target = event.target
        if (!(target instanceof Element)) return
        if (!target.closest(closeSelector)) return
        let record = session.toasts().find((item) => item.id === id)
        if (!record || record.permanent) return
        session.dismiss(id)
    }

    el.addEventListener("pointerenter", onEnter)
    el.addEventListener("pointerleave", onLeave)
    el.addEventListener("click", onClick)
    if (el.matches(":hover")) session.pause(id)
    return () => {
        el.removeEventListener("pointerenter", onEnter)
        el.removeEventListener("pointerleave", onLeave)
        el.removeEventListener("click", onClick)
    }
}
