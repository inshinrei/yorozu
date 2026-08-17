import {
    buildDigitSlots,
    canAnimate,
    formatCounterText,
    playDigitFlip,
    scheduleDigitFlip,
} from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountDigitFlip(root: HTMLElement): () => void {
    let value = 7
    let prevText = formatCounterText(value)

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let dec = document.createElement("button")
    dec.type = "button"
    dec.className = "pg-btn"
    dec.textContent = "−1"

    let inc = document.createElement("button")
    inc.type = "button"
    inc.className = "pg-btn pg-btn-primary"
    inc.textContent = "+1"

    let jump = document.createElement("button")
    jump.type = "button"
    jump.className = "pg-btn"
    jump.textContent = "+10"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Right-aligned char slots. Only changed digits rotateX."

    let row = document.createElement("div")
    row.className = "pg-digits"
    row.setAttribute("aria-live", "polite")

    toolbar.append(dec, inc, jump)
    tester.append(toolbar, hint, row)
    root.append(tester)

    function paint(nextValue: number): void {
        let text = formatCounterText(nextValue)
        let slots = buildDigitSlots(text, prevText, canAnimate(getAnimationLevel()))
        row.replaceChildren()
        for (let slot of slots) {
            let cell = document.createElement("span")
            cell.className = "pg-digit"
            cell.textContent = slot.char
            row.append(cell)
            if (slot.kind === "flip" && scheduleDigitFlip(true)) playDigitFlip(cell)
        }
        prevText = text
        value = nextValue
    }

    dec.addEventListener("click", () => paint(Math.max(0, value - 1)))
    inc.addEventListener("click", () => paint(value + 1))
    jump.addEventListener("click", () => paint(value + 10))
    paint(value)

    return () => {
        row.replaceChildren()
    }
}
