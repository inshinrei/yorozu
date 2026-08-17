import { canAnimate, createPopover, POPOVER_MS } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountPopover(root: HTMLElement): () => void {
    let open = false

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Scale and fade from the trigger. Low intensity snaps."

    let wrap = document.createElement("div")
    wrap.className = "pg-popover-wrap"

    let trigger = document.createElement("button")
    trigger.type = "button"
    trigger.className = "pg-btn pg-btn-primary"
    trigger.textContent = "Menu"
    trigger.setAttribute("aria-haspopup", "menu")
    trigger.setAttribute("aria-expanded", "false")

    let menu = document.createElement("div")
    menu.className = "pg-popover-menu"
    menu.setAttribute("role", "menu")
    menu.hidden = true
    for (let label of ["Open", "Pin", "Share"]) {
        let item = document.createElement("button")
        item.type = "button"
        item.className = "pg-popover-item"
        item.setAttribute("role", "menuitem")
        item.textContent = label
        item.addEventListener("click", () => setOpen(false))
        menu.append(item)
    }

    wrap.append(trigger, menu)
    tester.append(hint, wrap)
    root.append(tester)

    let popover = createPopover()

    function duration(): number {
        return canAnimate(getAnimationLevel()) ? POPOVER_MS : 0
    }

    function setOpen(next: boolean): void {
        if (next === open) return
        open = next
        trigger.setAttribute("aria-expanded", next ? "true" : "false")
        if (next) {
            menu.hidden = false
            popover.playOpen(menu, { durationMs: duration() })
            return
        }
        let playback = popover.playClose(menu, { durationMs: duration() })
        void playback.done.then((ran) => {
            if (ran && !open) menu.hidden = true
        })
    }

    trigger.addEventListener("click", () => setOpen(!open))

    return () => {
        popover.playClose(menu, { durationMs: 0 })
    }
}
