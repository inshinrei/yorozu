import { canAnimate, createPinchZoom } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountPinchZoom(root: HTMLElement): () => void {
    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let reset = document.createElement("button")
    reset.type = "button"
    reset.className = "pg-btn"
    reset.textContent = "Reset"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Ctrl or ⌘ + wheel zooms at the cursor. Wheel pans when scale is greater than 1."

    let viewport = document.createElement("div")
    viewport.className = "pg-pinch-view"

    let surface = document.createElement("div")
    surface.className = "pg-pinch-surface"
    surface.textContent = "Zoom surface"

    viewport.append(surface)
    toolbar.append(reset)
    tester.append(toolbar, hint, viewport)
    root.append(tester)

    let pinch = createPinchZoom({
        getEl: () => surface,
        getLayout: () => ({ width: surface.clientWidth, height: surface.clientHeight }),
        getViewport: () => ({ width: viewport.clientWidth, height: viewport.clientHeight }),
    })

    function onWheel(event: WheelEvent): void {
        if (canAnimate(getAnimationLevel())) return
        event.preventDefault()
        event.stopImmediatePropagation()
    }

    surface.addEventListener("wheel", onWheel, { capture: true, passive: false })
    reset.addEventListener("click", () => pinch.reset())

    return () => {
        surface.removeEventListener("wheel", onWheel, true)
        pinch.destroy()
    }
}
