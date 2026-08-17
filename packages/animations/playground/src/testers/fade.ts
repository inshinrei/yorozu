import { canAnimate, createFade, FADE_MS } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountFade(root: HTMLElement): () => void {
    let visible = true

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let toggle = document.createElement("button")
    toggle.type = "button"
    toggle.className = "pg-btn pg-btn-primary"
    toggle.textContent = "Hide"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Opacity-only show and hide. Duration 0 when intensity is low."

    let box = document.createElement("div")
    box.className = "pg-fade-box"
    box.textContent = "Fading surface"

    toolbar.append(toggle)
    tester.append(toolbar, hint, box)
    root.append(tester)

    function fadeForLevel() {
        return createFade(box, { durationMs: canAnimate(getAnimationLevel()) ? FADE_MS : 0 })
    }

    let fade = fadeForLevel()

    toggle.addEventListener("click", () => {
        fade = fadeForLevel()
        visible = !visible
        fade.setVisible(visible)
        toggle.textContent = visible ? "Hide" : "Show"
    })

    return () => {
        fade.setVisible(true)
    }
}
