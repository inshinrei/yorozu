import { canAnimateFull, createLayoutGrow } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

export function mountLayoutGrow(root: HTMLElement): () => void {
    let n = 0

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let toolbar = document.createElement("div")
    toolbar.className = "pg-toolbar"

    let add = document.createElement("button")
    add.type = "button"
    add.className = "pg-btn pg-btn-primary"
    add.textContent = "Add line"

    let remove = document.createElement("button")
    remove.type = "button"
    remove.className = "pg-btn"
    remove.textContent = "Remove line"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "Block size inverts from the last height. Duration is 0 unless intensity is high."

    let box = document.createElement("div")
    box.className = "pg-grow-box"

    function addLine(): void {
        n += 1
        let line = document.createElement("div")
        line.className = "pg-grow-line"
        line.textContent = `Line ${n}`
        box.append(line)
    }

    addLine()
    addLine()

    toolbar.append(add, remove)
    tester.append(toolbar, hint, box)
    root.append(tester)

    let grow = createLayoutGrow({
        el: box,
        isEnabled: () => canAnimateFull(getAnimationLevel()),
    })

    add.addEventListener("click", () => addLine())
    remove.addEventListener("click", () => {
        if (box.childElementCount <= 1) return
        box.lastElementChild?.remove()
    })

    return () => {
        grow.destroy()
    }
}
