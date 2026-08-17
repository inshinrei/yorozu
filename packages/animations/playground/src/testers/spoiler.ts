import { canAnimate, createSpoiler, SPOILER_MS } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountSpoiler(root: HTMLElement): () => void {
    let revealed = false

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let revealBtn = document.createElement("button")
    revealBtn.type = "button"
    revealBtn.className = "pg-btn pg-btn-primary"
    revealBtn.textContent = "Reveal"

    let resetBtn = document.createElement("button")
    resetBtn.type = "button"
    resetBtn.className = "pg-btn"
    resetBtn.textContent = "Reset"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "A dot-field overlay hides the surface. Reveal fades it out; low snaps."

    let cover = document.createElement("div")
    cover.className = "pg-spoiler"
    let title = document.createElement("h3")
    title.textContent = "Hidden note"
    let body = document.createElement("p")
    body.textContent = "The overlay sits above this copy until it is revealed."
    cover.append(title, body)

    toolbar.append(revealBtn, resetBtn)
    tester.append(toolbar, hint, cover)
    root.append(tester)

    function make(): ReturnType<typeof createSpoiler> {
        return createSpoiler(cover, {
            revealed: () => revealed,
            durationMs: canAnimate(getAnimationLevel()) ? SPOILER_MS : 0,
        })
    }

    let spoiler = make()

    revealBtn.addEventListener("click", () => {
        revealed = true
        spoiler.reveal()
    })
    resetBtn.addEventListener("click", () => {
        revealed = false
        spoiler.reset()
    })

    return () => spoiler.destroy()
}
