import { canAnimate, playPresencePop, shouldPresencePop } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountPresencePop(root: HTMLElement): () => void {
    let count = 0

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let add = document.createElement("button")
    add.type = "button"
    add.className = "pg-btn pg-btn-primary"
    add.textContent = "Add"

    let reset = document.createElement("button")
    reset.type = "button"
    reset.className = "pg-btn"
    reset.textContent = "Reset to 0"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Badge scales in only on 0 → N, never on remount or later increments."

    let wrap = document.createElement("div")
    wrap.className = "pg-presence-wrap"

    let label = document.createElement("span")
    label.className = "pg-presence-label"
    label.textContent = "Folder"

    let badge = document.createElement("span")
    badge.className = "pg-presence-badge"
    badge.hidden = true

    wrap.append(label, badge)
    toolbar.append(add, reset)
    tester.append(toolbar, hint, wrap)
    root.append(tester)

    function paint(next: number): void {
        let prev = count
        count = next
        if (next <= 0) {
            badge.hidden = true
            badge.textContent = ""
            return
        }
        badge.hidden = false
        badge.textContent = String(next)
        if (shouldPresencePop(prev, next) && canAnimate(getAnimationLevel())) playPresencePop(badge)
    }

    add.addEventListener("click", () => paint(count + 1))
    reset.addEventListener("click", () => paint(0))
    paint(0)

    return () => {
        badge.replaceChildren()
    }
}
