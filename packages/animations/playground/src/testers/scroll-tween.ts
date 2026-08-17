import { canAnimate, playScrollTween, SCROLL_TWEEN_MS } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountScrollTween(root: HTMLElement): () => void {
    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let start = document.createElement("button")
    start.type = "button"
    start.className = "pg-btn"
    start.textContent = "Start"

    let mid = document.createElement("button")
    mid.type = "button"
    mid.className = "pg-btn pg-btn-primary"
    mid.textContent = "Middle"

    let end = document.createElement("button")
    end.type = "button"
    end.className = "pg-btn"
    end.textContent = "End"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Tweens scrollLeft. Duration 0 when intensity is low."

    let strip = document.createElement("div")
    strip.className = "pg-scroll-strip"

    for (let i = 1; i <= 16; i++) {
        let chip = document.createElement("div")
        chip.className = "pg-scroll-chip"
        chip.textContent = `Item ${i}`
        strip.append(chip)
    }

    toolbar.append(start, mid, end)
    tester.append(toolbar, hint, strip)
    root.append(tester)

    function go(left: number): void {
        playScrollTween(strip, {
            left,
            durationMs: canAnimate(getAnimationLevel()) ? SCROLL_TWEEN_MS : 0,
        })
    }

    start.addEventListener("click", () => go(0))
    mid.addEventListener("click", () => go((strip.scrollWidth - strip.clientWidth) / 2))
    end.addEventListener("click", () => go(strip.scrollWidth))

    return () => {
        strip.replaceChildren()
    }
}
