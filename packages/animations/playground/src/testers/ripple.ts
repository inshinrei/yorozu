import { canAnimate, playRipple } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountRipple(root: HTMLElement): () => void {
    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Click the surface to drop ink at the pointer. Skipped when intensity is low."

    let host = document.createElement("div")
    host.className = "pg-ripple-host"
    host.setAttribute("role", "button")
    host.tabIndex = 0
    host.textContent = "Tap here"

    tester.append(hint, host)
    root.append(tester)

    function ink(event: PointerEvent): void {
        if (!canAnimate(getAnimationLevel())) return
        let box = host.getBoundingClientRect()
        playRipple(host, { x: event.clientX - box.left, y: event.clientY - box.top })
    }

    host.addEventListener("pointerdown", ink)

    return () => {
        host.replaceChildren()
    }
}
