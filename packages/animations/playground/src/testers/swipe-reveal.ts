import { canAnimate, createSwipeReveal, SWIPE_TWEEN_MS } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountSwipeReveal(root: HTMLElement): () => void {
    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Drag the row right. Past the threshold it commits; otherwise it springs back."

    let track = document.createElement("div")
    track.className = "pg-swipe-track"

    let action = document.createElement("div")
    action.className = "pg-swipe-action"
    action.textContent = "Reply"

    let row = document.createElement("div")
    row.className = "pg-swipe-row"
    row.textContent = "Swipe this row"
    row.tabIndex = 0

    track.append(action, row)
    tester.append(hint, track)
    root.append(tester)

    let swipe = createSwipeReveal(row, {
        get durationMs() {
            return canAnimate(getAnimationLevel()) ? SWIPE_TWEEN_MS : 0
        },
        onCommit: () => {
            row.textContent = "Committed"
        },
    })

    return () => swipe.destroy()
}
