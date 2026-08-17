import { canAnimate, playSendFlight, type Rect } from "@yorozu/animations"
import { getAnimationLevel } from "../level"

function rectOf(el: Element): Rect {
    let box = el.getBoundingClientRect()
    return { top: box.top, left: box.left, width: box.width, height: box.height }
}

export function mountSendFlight(root: HTMLElement): () => void {
    let n = 0

    let tester = document.createElement("div")
    tester.className = "pg-tester"

    let hint = document.createElement("p")
    hint.className = "pg-hint"
    hint.textContent = "A clone flies from the composer to the list insert point."

    let list = document.createElement("div")
    list.className = "pg-flight-list"

    let composer = document.createElement("div")
    composer.className = "pg-flight-composer"

    let seed = document.createElement("div")
    seed.className = "pg-flight-seed"
    seed.textContent = "Note"

    let send = document.createElement("button")
    send.type = "button"
    send.className = "pg-btn pg-btn-primary"
    send.textContent = "Send"

    composer.append(seed, send)
    tester.append(hint, list, composer)
    root.append(tester)

    function insertRow(label: string): HTMLElement {
        let row = document.createElement("div")
        row.className = "pg-flight-row"
        row.textContent = label
        list.prepend(row)
        return row
    }

    send.addEventListener("click", () => {
        n += 1
        let label = `Note ${n}`
        let from = rectOf(seed)
        let row = insertRow(label)
        if (!canAnimate(getAnimationLevel())) return
        let to = rectOf(row)
        playSendFlight({ host: document.body, from, to, node: seed })
    })

    return () => {
        list.replaceChildren()
    }
}
