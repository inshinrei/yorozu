import { canAnimate, createDock, type DockMode } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountDock(root: HTMLElement): () => void {
    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let toggle = document.createElement("button")
    toggle.type = "button"
    toggle.className = "pg-btn pg-btn-primary"
    toggle.textContent = "Open"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "A single panel opens from the right edge. Backdrop fades with it."

    let stage = document.createElement("div")
    stage.className = "pg-dock-stage"

    let backdrop = document.createElement("div")
    backdrop.className = "pg-dock-backdrop"

    let panel = document.createElement("aside")
    panel.className = "pg-dock-panel"
    panel.innerHTML = "<h3>Dock</h3><p>Side column. Close from the button or the backdrop.</p>"

    stage.append(backdrop, panel)
    tester.append(toolbar, hint, stage)
    toolbar.append(toggle)
    root.append(tester)

    let dock = createDock({
        getMode: (): DockMode => (canAnimate(getAnimationLevel()) ? "slide" : "none"),
        edge: "right",
    })
    dock.attach(panel)
    dock.attachBackdrop(backdrop)

    function sync(): void {
        stage.classList.toggle("is-open", dock.mounted)
        toggle.textContent = dock.mounted && !dock.leaving ? "Close" : "Open"
    }

    function setOpen(open: boolean): void {
        dock.setOpen(open)
        sync()
    }

    toggle.addEventListener("click", () => setOpen(!(dock.mounted && !dock.leaving)))
    backdrop.addEventListener("click", () => setOpen(false))
    sync()

    return () => dock.destroy()
}
