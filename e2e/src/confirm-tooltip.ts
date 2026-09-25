import "@yorozu/confirm-tooltip/default.css"
import { createConfirmTooltipSession, type ConfirmTooltipSession } from "@yorozu/confirm-tooltip"

let session: ConfirmTooltipSession | undefined

const onClose = (): void => {
    session?.destroy()
    document.querySelector("[data-yorozu-confirm-root]")?.remove()
    session = undefined
}

let openButton = document.querySelector("#open-confirm")
if (!(openButton instanceof HTMLButtonElement)) {
    throw new Error("missing #open-confirm")
}

let omitListenEsc = new URLSearchParams(window.location.search).get("esc") === "0"

openButton.addEventListener("click", (event: MouseEvent) => {
    if (session != null) return

    let root = document.createElement("div")
    root.setAttribute("data-yorozu-confirm-root", "")

    let panel = document.createElement("div")
    panel.setAttribute("data-yorozu-confirm", "")
    panel.tabIndex = -1

    let title = document.createElement("div")
    title.setAttribute("data-yorozu-confirm-title", "")
    title.textContent = "Delete this item?"

    let desc = document.createElement("p")
    desc.setAttribute("data-yorozu-confirm-desc", "")
    desc.textContent = "This cannot be undone."

    let actions = document.createElement("div")
    actions.setAttribute("data-yorozu-confirm-actions", "")

    let danger = document.createElement("button")
    danger.type = "button"
    danger.id = "confirm-danger"
    danger.setAttribute("data-yorozu-confirm-danger", "")
    danger.textContent = "Delete"
    danger.addEventListener("click", () => {
        session?.close()
    })

    actions.append(danger)
    panel.append(title, desc, actions)
    root.append(panel)
    document.body.append(root)

    session = createConfirmTooltipSession({
        onClose,
        ...(omitListenEsc ? {} : { listenEsc: true }),
        getDurationMs: () => 0,
    })
    session.attach(panel)
    session.place({ x: event.clientX, y: event.clientY })
})
